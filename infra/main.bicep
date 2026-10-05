// The mike-g profile Container App, joining the Container Apps environment and registry
// that already live in resource group mike-gordievsky (shared with the personal-brand apps).
// The pull identity and its AcrPull grant are created once by hand (see infra/README.md),
// so the very first revision can pull its image. Deploy with:
//
//   az deployment group create -g mike-gordievsky \
//     --template-file infra/main.bicep --parameters infra/main.parameters.json \
//     --parameters imageTag=<git-sha>

@description('Region of the existing Container Apps environment.')
param location string = 'westeurope'

param containerAppName string = 'mike-profile-web'

@description('Existing Container Apps environment in this resource group.')
param containerAppsEnvironmentName string = 'personal-brand-analytics-env'

@description('Existing registry in this resource group.')
param acrName string = 'mikegordievskypersonalbrand'

@description('Existing user-assigned identity that holds AcrPull on the registry.')
param pullIdentityName string = 'mike-profile-web-identity'

param imageRepository string = 'mike-profile-web'

@description('Image tag to deploy; the workflow passes the short git SHA.')
param imageTag string

@description('Custom hostname already bound to this app, e.g. mike.euhub.co. Empty until bound.')
param customDomainName string = ''

@description('Name of the environment managed certificate for customDomainName. Empty until bound.')
param customDomainCertificateName string = ''

@minValue(0)
@maxValue(5)
param minReplicas int = 1

@minValue(1)
@maxValue(10)
param maxReplicas int = 3

param cpu string = '0.25'
param memory string = '0.5Gi'

@description('Public origin of the site, used for passkeys and same-origin checks. Empty switches the admin panel off.')
param adminOrigin string = empty(customDomainName) ? '' : 'https://${customDomainName}'

@secure()
@description('Signs admin session cookies (32+ random characters). Empty switches the admin panel off.')
param adminSessionSecret string = ''

@secure()
@description('One-time token for /admin/setup. Remove it once the account exists to close the setup page.')
param adminSetupToken string = ''

@secure()
@description('Fine-grained GitHub token for the content repo (contents and actions write). Empty means no editing or publishing.')
param adminGithubToken string = ''

param adminGithubRepo string = 'michael-pov-it/profile'

@description('Globally unique name of the storage account that holds the admin account table.')
@minLength(3)
@maxLength(24)
param adminStorageAccountName string = 'mikeprofile${uniqueString(resourceGroup().id)}'

param tags object = {
  app: 'mike-profile'
  managed_by: 'github-actions'
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: containerAppsEnvironmentName
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: pullIdentityName
}

// A deploy replaces the app's whole configuration, so the admin settings have to be passed on
// every run. Without a session secret and an origin the admin panel is simply off.
var adminEnabled = !empty(adminSessionSecret) && !empty(adminOrigin)

resource adminStorage 'Microsoft.Storage/storageAccounts@2023-05-01' = if (adminEnabled) {
  name: adminStorageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource adminTableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = if (adminEnabled) {
  parent: adminStorage
  name: 'default'
}

resource adminTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = if (adminEnabled) {
  parent: adminTableService
  name: 'admin'
}

// The pipeline's Contributor role cannot create role assignments, so the app reaches the table
// with the account key (kept as a Container App secret) instead of a managed identity.
var adminStorageConnection = adminEnabled
  ? 'DefaultEndpointsProtocol=https;AccountName=${adminStorageAccountName};AccountKey=${adminStorage!.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
  : ''

var adminSecrets = adminEnabled
  ? concat(
      [
        { name: 'admin-session-secret', value: adminSessionSecret }
        { name: 'admin-storage-connection', value: adminStorageConnection }
      ],
      empty(adminSetupToken) ? [] : [{ name: 'admin-setup-token', value: adminSetupToken }],
      empty(adminGithubToken) ? [] : [{ name: 'admin-github-token', value: adminGithubToken }]
    )
  : []

var adminEnv = adminEnabled
  ? concat(
      [
        { name: 'ADMIN_SESSION_SECRET', secretRef: 'admin-session-secret' }
        { name: 'ADMIN_STORAGE_CONNECTION_STRING', secretRef: 'admin-storage-connection' }
        { name: 'ADMIN_ORIGIN', value: adminOrigin }
        { name: 'ADMIN_GITHUB_REPO', value: adminGithubRepo }
      ],
      empty(adminSetupToken) ? [] : [{ name: 'ADMIN_SETUP_TOKEN', secretRef: 'admin-setup-token' }],
      empty(adminGithubToken) ? [] : [{ name: 'ADMIN_GITHUB_TOKEN', secretRef: 'admin-github-token' }]
    )
  : []

var customDomains = empty(customDomainName) ? [] : [
  {
    name: customDomainName
    certificateId: '${containerAppsEnvironment.id}/managedCertificates/${customDomainCertificateName}'
    bindingType: 'SniEnabled'
  }
]

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentity.id}': {}
    }
  }
  dependsOn: [
    adminTable
  ]
  properties: {
    managedEnvironmentId: containerAppsEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: adminSecrets
      ingress: {
        external: true
        targetPort: 3000
        allowInsecure: false
        customDomains: customDomains
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
      registries: [
        {
          server: acr.properties.loginServer
          identity: pullIdentity.id
        }
      ]
    }
    template: {
      revisionSuffix: take(imageTag, 10)
      containers: [
        {
          name: 'mike-profile-web'
          image: '${acr.properties.loginServer}/${imageRepository}:${imageTag}'
          env: concat(
            [
              { name: 'NEXT_TELEMETRY_DISABLED', value: '1' }
            ],
            adminEnv
          )
          resources: {
            cpu: json(cpu)
            memory: memory
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: { path: '/robots.txt', port: 3000 }
              initialDelaySeconds: 5
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: { path: '/robots.txt', port: 3000 }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
      }
    }
  }
}

@description('Azure-generated hostname, e.g. mike-profile-web.jollymeadow-f8c88678.westeurope.azurecontainerapps.io.')
output fqdn string = containerApp.properties.configuration.ingress.fqdn

@description('Public URL: the custom domain once bound, otherwise the Azure-generated one.')
output url string = empty(customDomainName) ? 'https://${containerApp.properties.configuration.ingress.fqdn}' : 'https://${customDomainName}'

@description('Whether this deployment turned the admin panel on.')
output adminEnabled bool = adminEnabled

output deployedImage string = '${acr.properties.loginServer}/${imageRepository}:${imageTag}'

@description('Value for the asuid TXT record when binding a custom domain.')
output customDomainVerificationId string = containerApp.properties.customDomainVerificationId
