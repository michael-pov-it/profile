# Deploying the profile to Azure Container Apps

The site runs as Container App **`mike-profile-web`** in resource group **`mike-gordievsky`** (westeurope, subscription EUHub). It shares that group's existing Container Apps environment (`personal-brand-analytics-env`) and registry (`mikegordievskypersonalbrand`) with the personal-brand apps, and doesn't touch them.

Deploys are **manual**: GitHub → Actions → **Deploy to Azure Container Apps** → **Run workflow**, or `gh workflow run deploy.yml --ref main`. The run summary and the repo's **production** environment show the live URL. Pushing to `main` deploys nothing.

The workflow has one input, **`site_indexable`** (default off). Leave it off while sample content is live: the site then sends `noindex` headers and an empty sitemap. Turn it on for a deploy once the content is real.

## Pieces

- `Dockerfile`: bun build of the Next.js standalone server on port 3000. It includes `content/`, which request-time 404 pages read.
- `infra/main.bicep`: the Container App: external HTTPS ingress, probes on `/robots.txt`, 0.25 vCPU / 0.5Gi, 1–3 replicas. Its image pull uses the user-assigned identity `mike-profile-web-identity`.
- `.github/workflows/deploy.yml`: lint, types, tests and `infra/check-workflow.sh` → push the image to ACR → apply the Bicep template.
- `infra/check-workflow.sh`: static guardrails for the workflow (manual trigger only, correct targets, no role assignments).

## One-time setup (done 2026-09-28)

Everything below already exists. Keep it for rebuilding from scratch. Run with an account that has Owner on EUHub.

```bash
az account set --subscription 42d3345a-2568-48e0-a414-3fc00ee2cba7

az identity create -g mike-gordievsky -n mike-profile-web-identity -l westeurope
az role assignment create --assignee-object-id "$(az identity show -g mike-gordievsky -n mike-profile-web-identity --query principalId -o tsv)" \
  --assignee-principal-type ServicePrincipal --role AcrPull --scope "$(az acr show -n mikegordievskypersonalbrand --query id -o tsv)"

APP_ID=$(az ad app create --display-name gh-oidc-mike-profile-deploy --query appId -o tsv); az ad sp create --id "$APP_ID"
az ad app federated-credential create --id "$APP_ID" --parameters '{"name":"gh-environment-production","issuer":"https://token.actions.githubusercontent.com","subject":"repo:EUHUB-AI/profile:environment:production","audiences":["api://AzureADTokenExchange"]}'
SP_ID=$(az ad sp show --id "$APP_ID" --query id -o tsv)
az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal --role Contributor --scope "$(az group show -n mike-gordievsky --query id -o tsv)"
az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal --role AcrPush --scope "$(az acr show -n mikegordievskypersonalbrand --query id -o tsv)"

gh api -X PUT repos/EUHUB-AI/profile/environments/production
gh variable set AZURE_CLIENT_ID --env production --repo EUHUB-AI/profile --body "$APP_ID"
gh variable set AZURE_TENANT_ID --env production --repo EUHUB-AI/profile --body "$(az account show --query tenantId -o tsv)"
gh variable set AZURE_SUBSCRIPTION_ID --env production --repo EUHUB-AI/profile --body 42d3345a-2568-48e0-a414-3fc00ee2cba7
```

If `azure/login` fails with `AADSTS700213`, copy the exact subject from the failed run's log and run `az ad app federated-credential update --id "$APP_ID" --federated-credential-id gh-environment-production --parameters '{"subject":"<exact subject>"}'`.

## Custom domain

`mike.euhub.co` is bound with a managed certificate and recorded in `infra/main.parameters.json` (`customDomainName`, `customDomainCertificateName`). Keep those two values: without them the next deploy removes the domain from the app. DNS for `euhub.co` is on Google Cloud DNS, edited by hand:

- `CNAME mike` → the app's Azure hostname
- `TXT asuid.mike` → the app's `customDomainVerificationId`

## Admin panel (`/admin`)

The panel lets Mike sign in with a passkey or a password and add, edit and delete content, then press **Publish** to deploy. Design: `docs/superpowers/specs/2026-10-05-admin-panel-design.md`. It is **off** until the secrets below exist, and a deploy without them switches it off again, because a Bicep deploy replaces the app's whole configuration.

### Turn it on (once)

1. Make two random secrets (keep them out of the repo):
   ```bash
   openssl rand -base64 48   # ADMIN_SESSION_SECRET: signs session cookies
   openssl rand -base64 24   # ADMIN_SETUP_TOKEN: one-time key for /admin/setup
   ```
2. Create a **fine-grained GitHub token** at github.com/settings/personal-access-tokens: only repository `michael-pov-it/profile`; permissions **Contents: read and write**, **Actions: read and write**, Metadata: read. It saves content to `main` and starts the deploy workflow. Set a long expiry and put a reminder in the calendar.
3. Store all three as secrets of the `production` environment:
   ```bash
   gh secret set ADMIN_SESSION_SECRET --env production --repo michael-pov-it/profile
   gh secret set ADMIN_SETUP_TOKEN    --env production --repo michael-pov-it/profile
   gh secret set ADMIN_GITHUB_TOKEN   --env production --repo michael-pov-it/profile
   ```
4. Run the deploy workflow. Bicep creates a storage account with an `admin` table in `mike-gordievsky` and passes the settings to the app as Container App secrets.
5. Open `https://mike.euhub.co/admin/setup`, enter the setup token, and create the account (username and a password of 12 or more characters). Then add a passkey on `/admin/security`.
6. Delete the `ADMIN_SETUP_TOKEN` secret and deploy once more. `/admin/setup` then answers 404.

### Things to know

- Passkeys belong to the host in `adminOrigin` (`mike.euhub.co`). They do not work on the `*.azurecontainerapps.io` address; use the password there.
- Add a second passkey on another device, or keep the password: it is the only way back in if the one passkey device is lost. If both are lost, delete the `admin` table row (`PartitionKey admin`, `RowKey account`) in the storage account and run setup again with a new token.
- The storage account name is `mikeprofile` plus a hash of the resource group, set by `adminStorageAccountName`. The app reaches the table with the account key, kept as the Container App secret `admin-storage-connection`, because the pipeline's Contributor role cannot create role assignments.
- Saves are direct commits to `main`. If branch protection is turned on for `main`, saves fail with a clear message; let the token's owner bypass it or move the panel to pull requests.
- **Publish** passes the crawler setting the running image was built with, so it never makes the site indexable by itself.
