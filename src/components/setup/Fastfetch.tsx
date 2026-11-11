import { Markdown } from '@/components/Markdown';
import { Prompt } from '@/components/shell/Prompt';
import { SampleTag } from '@/components/SampleTag';
import type { groupMachines } from '@/lib/tui/setup';

const GROUP_LABEL = { work: 'Work', home: 'Home' } as const;

export function Fastfetch({ groups, handle }: { groups: ReturnType<typeof groupMachines>; handle: string }) {
  return (
    <>
      {groups.map(({ group, machines }, i) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <Prompt
            level={2}
            id={`group-${group}`}
            cmd={`fastfetch --group ${group}`}
            label={GROUP_LABEL[group]}
            className={i === 0 ? 'mt-0' : undefined}
          />
          <div className="grid gap-x-[6ch] gap-y-10 2xl:grid-cols-2">
            {machines.map((machine) => (
              <article key={machine.slug} className="min-w-0">
                <h3 className="border-b border-rule pb-1">
                  {handle}@{machine.name} <SampleTag show={machine.sample} />
                </h3>
                {machine.purpose ? <p className="mt-2 text-dim">{machine.purpose}</p> : null}
                <dl className="mt-3 grid grid-cols-[8ch_minmax(0,1fr)] gap-y-1">
                  {machine.rows.map((row, j) => (
                    <div key={`${row.label}-${j}`} className="contents">
                      <dt className="text-dim">{row.label}</dt>
                      <dd className="min-w-0 break-words">{row.value}</dd>
                    </div>
                  ))}
                </dl>
                {machine.body.trim() ? (
                  <div className="mt-3">
                    <Markdown source={machine.body} />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
