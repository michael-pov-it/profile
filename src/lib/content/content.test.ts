import { describe, expect, it } from 'vitest';
import { getBooks, getCareer, getHobbies, getLanguages, getMachines, getProfile, getSports, getTrips } from './collections';

describe('content/ folder', () => {
  it('has a valid profile', () => {
    expect(getProfile().name).toBeTruthy();
  });

  it.each([
    ['career', getCareer],
    ['books', getBooks],
    ['travel', getTrips],
    ['languages', getLanguages],
    ['sport', getSports],
    ['hobbies', getHobbies],
    ['machines', getMachines],
  ] as const)('%s entries all pass validation', (_name, load) => {
    // Loading validates every existing entry; optional sections may be empty.
    expect(() => load()).not.toThrow();
    expect(load().every((entry) => !entry.sample)).toBe(true);
  });
});
