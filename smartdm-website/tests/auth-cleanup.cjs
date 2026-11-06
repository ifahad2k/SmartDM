const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('../node_modules/typescript');

function loadAuth(failure) {
  const changes = [];
  const calls = [];
  const requests = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useEffect: () => {},
    useState(initial) {
      const index = calls.length;
      calls.push(initial);
      return [initial, value => changes.push({ index, value })];
    },
    createElement: (_type, props) => props.value
  };
  const firebase = Object.fromEntries(['signInWithEmailAndPassword', 'createUserWithEmailAndPassword', 'signInWithPopup', 'sendPasswordResetEmail'].map(name => [name, async () => {
    requests.push(name);
    if (failure) throw failure;
    return { user: { emailVerified: true } };
  }]));
  firebase.sendEmailVerification = async () => {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/context/AuthContext.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports, console,
    require(name) {
      if (name === 'react') return react;
      if (name === 'firebase/auth') return firebase;
      if (name === 'firebase/firestore') return {};
      if (name === '../config/firebase') return {};
      throw new Error(`Unexpected import: ${name}`);
    }
  });
  return { auth: exports.AuthProvider({ children: null }), changes, requests };
}

for (const method of ['signInWithEmail', 'signUpWithEmail', 'signInWithGoogle', 'signInWithGithub', 'resetPassword']) {
  test(`${method} preserves Firebase configuration failure without signing in`, async () => {
    const failure = Object.assign(new Error('Invalid key'), { code: 'auth/invalid-api-key' });
    const { auth, changes } = loadAuth(failure);
    await assert.rejects(auth[method]('admin@example.com', 'password123'), /Invalid key/);
    assert.ok(!changes.some(change => change.index === 0 && change.value));
    assert.ok(!changes.some(change => change.index === 2 && change.value));
    assert.ok(changes.some(change => change.index === 4 && change.value === 'Invalid key'));
  });
  test(`${method} retains successful Firebase path`, async () => {
    const { auth, changes, requests } = loadAuth();
    await auth[method]('person@example.com', 'password123');
    assert.equal(requests.length, 1);
    assert.ok(!changes.some(change => change.index === 4 && change.value));
  });
}
for (const method of ['signInWithGoogle', 'signInWithGithub']) {
  test(`${method} preserves popup-close feedback`, async () => {
    const { auth } = loadAuth(Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }));
    await assert.rejects(auth[method](), /popup was closed/);
  });
}
test('debug identities are not exposed by the auth provider', () => {
  const { auth } = loadAuth();
  assert.equal(auth.loginAsAdmin, undefined);
  assert.equal(auth.loginAsUser, undefined);
});
