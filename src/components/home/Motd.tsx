import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { SampleTag } from '@/components/SampleTag';
import type { Profile } from '@/lib/content/collections';
import type { MotdSummary } from '@/lib/tui/motd';
import { MotdPlayback } from './MotdPlayback';

export function Motd({ profile, summary, asOf }: { profile: Profile; summary: MotdSummary; asOf: string }) {
  const lines: ReactNode[] = [
    `Welcome to ${profile.host} (GNU/Life, SRE edition)`,
    '',
    ` * Role:      ${profile.role}`,
    <>
      {' * Contact:   '}
      <a href="#contact" data-nav-item>
        finger {profile.handle}
      </a>
    </>,
    '',
    `  System information as of ${asOf}`,
    '',
    summary.machines > 0 ? (
      <>
        {'  Hardware:    '}
        <Link href="/setup" data-nav-item>
          {summary.machines} {summary.machines === 1 ? 'machine' : 'machines'}
          {summary.connection ? `, ${summary.connection}` : ''}
        </Link>
        <SampleTag show={summary.samples.machines} />
      </>
    ) : null,
    <>
      {'  Reading:     '}
      <Link href="/books" data-nav-item>
        {summary.reading} in progress
      </Link>
      <SampleTag show={summary.samples.books} />
    </>,
    <>
      {'  Countries:   '}
      <Link href="/travel" data-nav-item>
        {summary.countries} visited
      </Link>
      <SampleTag show={summary.samples.trips} />
    </>,
    <>
      {'  Languages:   '}
      <Link href="/languages" data-nav-item>
        {summary.languagesRunning} of {summary.languagesTotal} in rollout
      </Link>
      <SampleTag show={summary.samples.languages} />
    </>,
    summary.streak ? (
      <>
        {'  Streak:      '}
        <Link href="/sport" data-nav-item>
          {summary.streak.days} days ({summary.streak.sport.toLowerCase()})
        </Link>
        <SampleTag show={summary.streak.sample} />
      </>
    ) : null,
    <>
      {'  Services:    '}
      <Link href="/hobbies" data-nav-item>
        {summary.hobbiesActive} of {summary.hobbiesTotal} hobbies active
      </Link>
      <SampleTag show={summary.samples.hobbies} />
    </>,
    '',
    summary.nowReading ? (
      <>
        {'  Now reading: '}
        <Link href={`/books/${summary.nowReading.slug}`} data-nav-item>
          {summary.nowReading.title}
        </Link>
        {' '}
        <span className="whitespace-nowrap">({summary.nowReading.progress}%)</span>
        <SampleTag show={summary.nowReading.sample} />
      </>
    ) : null,
    summary.lastTrip ? (
      <>
        {'  Last hop:    '}
        <Link href={`/travel/${summary.lastTrip.slug}`} data-nav-item>
          {summary.lastTrip.host}
        </Link>
        {' '}
        <span className="whitespace-nowrap">({summary.lastTrip.start})</span>
        <SampleTag show={summary.lastTrip.sample} />
      </>
    ) : null,
  ].filter((line) => line !== null);

  return (
    <>
      <pre className="motd">
        {lines.map((line, i) => {
          // Lines with a label wrap under their value: 14 characters in for " * Role:", 15 for the
          // rest. Plain sentences (the welcome and the date line) wrap from the left edge.
          const hang = typeof line !== 'string' ? 15 : line.startsWith(' * ') ? 14 : 0;
          return (
            <span
              key={i}
              className={hang ? 'motd-line motd-hang' : 'motd-line'}
              style={{ '--i': i, ...(hang ? { '--hang': `${hang}ch` } : {}) } as CSSProperties}
            >
              {line}
              {'\n'}
            </span>
          );
        })}
      </pre>
      <MotdPlayback />
    </>
  );
}
