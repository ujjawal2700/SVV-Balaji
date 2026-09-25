/**
 * Client-generated ids for records the field app can create offline.
 *
 * -----------------------------------------------------------------------------
 * The field app keeps working with no signal: a farmer registered, a visit
 * recorded or a seed handout logged is stored on the phone and sent when the
 * connection returns. Two things make that safe, and both hang off this id:
 *
 *  1. References between offline records. A visit recorded against a farmer
 *     who was registered offline ten minutes earlier needs that farmer's id
 *     before the server has ever seen the farmer. The phone mints a UUID and
 *     both records use it.
 *
 *  2. Exactly-once delivery. A request can reach the server and lose its
 *     response on the way back; the phone cannot tell that from "never
 *     arrived" and sends it again. Because the id is the record's primary key,
 *     the second send finds the first record and returns it instead of creating
 *     a duplicate - and, for a seed handout, instead of deducting stock twice.
 *
 * The id is optional everywhere; online clients that do not send one get a
 * server-generated id exactly as before. It is never accepted on an update.
 * -----------------------------------------------------------------------------
 */
export const CLIENT_ID_DESCRIPTION =
  'Optional client-generated UUID for offline capture. Re-sending a create with an id that ' +
  'already exists returns the existing record instead of creating a duplicate.';
