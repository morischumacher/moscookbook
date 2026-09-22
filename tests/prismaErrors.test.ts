/** prismaErrors — reading Prisma's failures without importing Prisma */
import { suite, check, equal } from './harness';
import { describeWriteFailure, isPrismaError } from '../src/lib/prismaErrors';

/**
 * Twenty lines that every write route's catch block depends on, and until
 * now no test. It is exactly the kind of duck-typed string comparison that
 * silently stops matching when a dependency changes shape, so the shape it
 * expects is written down here.
 */
export default function prismaErrorsTests() {
    suite('isPrismaError');

    check('matches by code', isPrismaError({ code: 'P2002' }, 'P2002'));
    check('a different code is not a match', !isPrismaError({ code: 'P2003' }, 'P2002'));
    check('a plain Error has no code', !isPrismaError(new Error('P2002'), 'P2002'));
    check('null is not an error', !isPrismaError(null, 'P2002'));
    check('a string is not an error', !isPrismaError('P2002', 'P2002'));

    /*
     * The archive import returned Prisma's own message to the screen. Those
     * name the model, the field, the constraint and the expected type, and a
     * pool error would carry a connection string the same way. The person
     * gets a sentence; the log gets the rest.
     */
    suite('describeWriteFailure');

    equal('a duplicate', describeWriteFailure({ code: 'P2002' }), 'already exists');
    equal('a broken reference', describeWriteFailure({ code: 'P2003' }), 'refers to something that is not there');
    equal('a missing row', describeWriteFailure({ code: 'P2025' }), 'not found');
    equal('an oversized value', describeWriteFailure({ code: 'P2000' }), 'a value is too long for its field');

    const leaky = new Error(
        'Invalid `prisma.recipe.create()` invocation: Unique constraint failed on the fields: (`slug`) — postgres://user:hunter2@db.internal:5432/x'
    );
    const described = describeWriteFailure(leaky);
    equal('anything else is a fixed sentence', described, 'could not be written');
    check('and never the message itself', !described.includes('hunter2') && !described.includes('prisma'), described);
}
