"use strict";
describe('chans', function () {
    const logger = (txt) => console.log(txt);
    describe('binary helpers', function () {
        it('hexlify', function () {
            const hexStr = UserIdentity.hexlify(new Uint8Array([42, 0, 10, 0xff]));
            assert.strictEqual(hexStr, '2a000aff');
        });
        it('hexlify unhexlify identity 1', function () {
            const arr = new Uint8Array([42, 0, 10, 0xff, 0x23, 0xab]);
            assert.deepEqual(UserIdentity.unhexlify(UserIdentity.hexlify(arr)), arr);
        });
        it('hexlify unhexlify identity 2', function () {
            const hexStr = '01020342ab0fff';
            assert.strictEqual(UserIdentity.hexlify(UserIdentity.unhexlify(hexStr)), hexStr);
        });
        it('unhexlify empty', function () {
            const hexStr = '';
            assert.deepEqual(UserIdentity.unhexlify(hexStr), new Uint8Array(0));
        });
        it('unhexlify string', function () {
            const hexStr = 'ff010242ab';
            assert.deepEqual(UserIdentity.unhexlify(hexStr), new Uint8Array([0xff, 0x1, 0x2, 0x42, 0xab]));
        });
        it('uid lenghth 384 bits', async function () {
            const uid = await UserIdentity.create(logger);
            const bits384inHexStr = 48 * 2;
            assert.strictEqual(uid.uidHash.length, bits384inHexStr);
        });
        it('valid challenge response run', async function () {
            const Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice");
            const challenge = whatAliceClaims.generateChallenge();
            const response = await Alice.responseForChallenge(challenge);
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, true);
        });
        it('invalid challenge response run', async function () {
            let Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice");
            const challenge = whatAliceClaims.generateChallenge();
            Alice = await UserIdentity.create(logger); //  re-initializing Alice, destroying original key, so challenge must fail
            const response = await Alice.responseForChallenge(challenge);
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, false);
        });
        it('invalid response', async function () {
            let Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice");
            const challenge = whatAliceClaims.generateChallenge();
            const response = ''; // invalid response
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, false);
        });
        it('invalid response 2', async function () {
            let Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice");
            const challenge = whatAliceClaims.generateChallenge();
            const response = '00b662f1039a8d44f7b558d2715ea9ce0fc4f211f6a65782d57c3bfbe4b066fdcd27595b0f7658c6fd021f0ea8608717f5239ea58c3cea7d7f34682790d14728cf7c00e2826bae78a7a36df461d9abcabea2c3479c508bf3ff6946af9db98a238a8a4ce4a2c7c39adb67ec56c9b3803c676390db55db95a63effb6f87b76016b840424be'; // wrong response
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, false);
        });
    });
});
