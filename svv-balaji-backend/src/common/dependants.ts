import { ConflictException } from '@nestjs/common';

/**
 * Shared refusal logic for hard deletes.
 *
 * This is a traceability system: almost every master record is the anchor of a
 * chain that runs forward into batches, inspections and invoices. Deleting one
 * that is referenced anywhere would either break the chain or - because every
 * relation here is RESTRICT rather than CASCADE - fail at the database with a
 * raw `P2003 Foreign key constraint failed`, which tells the user nothing.
 *
 * So we count first and refuse with the actual reason. The rule across all
 * masters is the same and worth stating once:
 *
 *   Delete is only ever possible while a record is genuinely unused. The moment
 *   anything downstream references it, the correct action is to deactivate -
 *   which removes it from every dropdown while leaving the history intact.
 *
 * `counts` maps a human-readable plural noun to the number of rows referencing
 * this record. Only non-zero entries appear in the message.
 */
export function assertDeletable(
  entity: string,
  label: string,
  counts: Record<string, number>,
): void {
  const blocking = Object.entries(counts).filter(([, n]) => n > 0);
  if (blocking.length === 0) return;

  const phrases = blocking.map(([noun, n]) => `${n} ${pluralise(noun, n)}`);

  throw new ConflictException(
    `${entity} "${label}" cannot be deleted - ${list(phrases)} still ` +
      `${blocking.length === 1 && blocking[0][1] === 1 ? 'references' : 'reference'} it. ` +
      `Deactivate it instead: it stops appearing in dropdowns and cannot be used on new ` +
      `records, while everything already linked to it stays intact.`,
  );
}

/**
 * Nouns are supplied in plural form because that is how they read in the
 * message far more often. Singularising the handful of irregular ones we
 * actually use is cheaper and safer than a general-purpose inflector.
 */
const IRREGULAR: Record<string, string> = {
  batches: 'batch',
  inspections: 'inspection',
  deliveries: 'delivery',
  entries: 'entry',
  histories: 'history',
};

function pluralise(plural: string, n: number): string {
  if (n !== 1) return plural;
  if (IRREGULAR[plural]) return IRREGULAR[plural];
  if (plural.endsWith('ies')) return `${plural.slice(0, -3)}y`;
  if (plural.endsWith('es') && /(ch|sh|s|x|z)es$/.test(plural)) return plural.slice(0, -2);
  if (plural.endsWith('s')) return plural.slice(0, -1);
  return plural;
}

/** "a", "a and b", "a, b and c" - the form a person would write. */
function list(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
