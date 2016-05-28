'use strict';

const assert = require('chai').assert;
const sinon = require('sinon');
const createBuilder = require('../lib/builder').createBuilder;

sinon.assert.expose(assert, { prefix: '' });

describe('Page Builder', function () {
    const mockTemplate = '{{body}}';
    let mockEnvelope;

    beforeEach(function () {
        mockEnvelope = {
            parse: (body) => body,
            combine: (responses) => ({ body: responses.join() }),
            recoverError: sinon.spy()
        };
    });

    describe('#createBuilder', function () {
        it('should return a function', function () {
            assert.isFunction(createBuilder());
        });

        it('should build a static page', function () {
            const template = 'Hello';

            const buildPage = createBuilder(template);

            return buildPage().then((page) =>
                assert.strictEqual(page, 'Hello'));
        });

        it('should build a page with dynamic properties', function () {
            const template = '{{greeting}}, {{name}}.';

            mockEnvelope.combine = () => ({ greeting: 'Hello', name: 'Janet' });

            const buildPage = createBuilder(template, null, null, mockEnvelope);

            return buildPage().then((page) =>
                assert.strictEqual(page, 'Hello, Janet.'));
        });

        it('should render data in config order, not endpoint response order', function () {
            this.slow(500);

            const config = JSON.stringify({
                components: [
                    { endpoint: '100ms response' },
                    { endpoint: '25ms response' },
                    { endpoint: '50ms response' }
                ]
            });

            const mockRp = (url) => new Promise((resolve) =>
                setTimeout(() => resolve(url), url.split('ms').pop()));

            const buildPage = createBuilder(mockTemplate, config, mockRp, mockEnvelope);

            return buildPage().then((page) =>
                assert.strictEqual(page, '100ms response,25ms response,50ms response'));
        });

        it('should expand {{parameters}} within endpoint URLs', function () {
            const config = JSON.stringify({
                components: [
                    { endpoint: 'http://{{hostname}}/favicon.ico' }
                ]
            });

            const mockRp = sinon.stub();
            mockRp.returns(Promise.resolve());

            const buildPage = createBuilder(mockTemplate, config, mockRp, mockEnvelope);

            return buildPage({ hostname: 'squeak.com' }).then(() =>
                assert.calledWithExactly(mockRp, 'http://squeak.com/favicon.ico'));
        });

        describe('Errors', function () {
            it('should throw an error on invalid config', function () {
                const buildPage = createBuilder('', 'XXzxzzINVALID');

                assert.throws(buildPage, SyntaxError);
            });

            it('should throw an async error on missing template', function () {
                const buildPage = createBuilder();

                // Little dance to check that async error is thrown
                return buildPage()
                    .then(assert.fail)
                    .catch((err) => assert.instanceOf(err, TypeError));
            });

            it('should allow recovery of request errors', function () {
                const config = JSON.stringify({
                    components: [
                        { endpoint: 'causes-a-request-error' }
                    ]
                });

                const mockRp = () => Promise.reject(new Error('async error'));

                const buildPage = createBuilder(mockTemplate, config, mockRp, mockEnvelope);

                return buildPage().then(() =>
                    assert.calledWithMatch(mockEnvelope.recoverError, { message: 'async error' }));
            });

            it('should allow recovery of parsing errors', function () {
                const config = JSON.stringify({
                    components: [
                        { endpoint: 'causes-a-parsing-error' }
                    ]
                });

                const mockRp = () => Promise.resolve('unparseable body');

                mockEnvelope.parse = () => {
                    throw new Error('parse error');
                };

                const buildPage = createBuilder(mockTemplate, config, mockRp, mockEnvelope);

                return buildPage().then(() =>
                    assert.calledWithMatch(mockEnvelope.recoverError, { message: 'parse error' }));
            });
        });
    });
});