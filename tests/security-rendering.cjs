// Dependency-free offline DOM-sink regression tests (not a browser emulator).
// Run: node tests/security-rendering.cjs
// Optional: PETPLES_BASELINE=/path/to/pristine/tree node tests/security-rendering.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const marker = '<img src=missing onerror="window.__securityTest=1">';
const quotedMarker = '">' + marker;
const user = { userid: 'test-user', preferred_breed: '' };
const room = { name: '콩이', imgSrc: 'images/siba.png', lastMessage: '안녕하세요', time: '오후 1:00' };
const fields = ['userid', 'human_name', 'human_age', 'human_gender', 'neighborhood', 'pet_type', 'pet_breed', 'pet_gender', 'pet_age', 'pet_weight', 'pet_reg_number'];
let count = 0;

function render(source, filename, values = {}, search = '') {
    const htmlSinks = [];
    class Element {
        constructor() {
            this.children = [];
            this.queries = new Map();
            this.dataset = {};
            this.style = {};
            this.events = {};
            this.textContent = '';
            this.className = '';
            this.classList = {
                contains: name => this.className.split(/\s+/).includes(name),
                add() {}, remove() {}, toggle() {}
            };
        }
        set innerHTML(value) {
            this.html = String(value);
            htmlSinks.push(this.html);
            this.children = [];
            this.queries.clear();
        }
        get innerHTML() { return this.html || ''; }
        querySelector(selector) {
            if (!this.queries.has(selector)) {
                const element = new Element();
                if (selector.startsWith('.')) element.className = selector.slice(1);
                this.queries.set(selector, element);
            }
            return this.queries.get(selector);
        }
        querySelectorAll(selector) {
            if (selector === '[data-field]') {
                return [...this.innerHTML.matchAll(/data-field="([^"]+)"/g)].map(([, key]) => {
                    const element = this.querySelector(`[data-field="${key}"]`);
                    element.dataset.field = key;
                    return element;
                });
            }
            return [];
        }
        appendChild(element) { this.children.push(element); return element; }
        addEventListener(type, handler) { this.events[type] = handler; }
        click() { if (this.events.click) this.events.click({ target: this }); }
    }
    const elements = new Map();
    const ready = [];
    const get = id => {
        if (!elements.has(id)) elements.set(id, new Element());
        return elements.get(id);
    };
    const storage = new Map(Object.entries(values).map(([key, value]) => [key, JSON.stringify(value)]));
    const document = {
        addEventListener(type, callback) { if (type === 'DOMContentLoaded') ready.push(callback); },
        getElementById: get,
        createElement: () => new Element(),
        querySelector: selector => selector === '.nav-toggle' || selector === '.nav' ? null : get(selector),
        querySelectorAll: () => []
    };
    const context = vm.createContext({
        document,
        window: { location: { search, href: '' } },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), clear: () => storage.clear() },
        URLSearchParams, encodeURIComponent, alert() {}, confirm: () => false, setTimeout() {}
    });
    const html = fs.readFileSync(path.join(source, filename), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename }).runInContext(context, { timeout: 1000 });
    }
    ready.forEach(callback => callback());
    return { get, htmlSinks, storage, context };
}

function verify(result, vulnerable) {
    assert.equal(result.htmlSinks.some(value => value.includes(marker)), vulnerable, 'untrusted input must never be sent to the HTML parser');
    count++;
}

function adversarial(source, vulnerable) {
    let result = render(source, 'chat.html', {}, '?with=' + encodeURIComponent(quotedMarker));
    verify(result, vulnerable);
    if (!vulnerable) assert.equal(new URL(result.get('chat-header').querySelector('a').href, 'https://example.test').searchParams.get('dog'), quotedMarker);
    for (const field of fields) {
        result = render(source, 'mypage.html', { petples_user: { ...user, [field]: marker } });
        verify(result, vulnerable);
        if (!vulnerable) assert.equal(result.get('user-info').querySelector(`[data-field="${field}"]`).textContent, marker + (field === 'pet_weight' ? 'kg' : ''));
    }
    for (const field of ['name', 'imgSrc', 'lastMessage', 'time']) {
        const value = ['name', 'imgSrc'].includes(field) ? quotedMarker : marker;
        result = render(source, 'chat_list.html', { petples_chat_rooms: [{ ...room, [field]: value }] });
        verify(result, vulnerable);
        if (!vulnerable) {
            const item = result.get('chat-list').children[0];
            const selectors = { name: '.name', lastMessage: '.last-message', time: '.time' };
            if (selectors[field]) assert.equal(item.querySelector(selectors[field]).textContent, value);
            else assert.equal(item.querySelector('img').src, value);
            assert.equal(new URL(item.querySelector('a').href, 'https://example.test').searchParams.get('with'), field === 'name' ? value : room.name);
        }
    }
    for (const field of ['name', 'imgSrc']) {
        result = render(source, 'matching.html', { petples_user: user, blocked_users: [{ ...room, [field]: quotedMarker }] });
        verify(result, vulnerable);
        if (!vulnerable) {
            const item = result.get('blocked-list').children[0];
            assert.equal(item.querySelector('.unblock-btn').dataset.name, field === 'name' ? quotedMarker : room.name);
            if (field === 'name') assert.equal(item.querySelector('.user-details').textContent, quotedMarker);
            else assert.equal(item.querySelector('img').src, quotedMarker);
        }
    }
}

function normal() {
    let result = render(root, 'chat.html', {}, '?with=' + encodeURIComponent('콩이'));
    assert.equal(result.get('chat-header').querySelector('.name').textContent, '김시바');
    assert.equal(result.get('chat-header').querySelector('.age').textContent, '28세');
    result.get('message-input').value = marker;
    result.get('send-btn').click();
    assert.equal(result.get('chat-messages').children[0].textContent, marker);
    verify(result, false);
    for (const name of ['__proto__', 'constructor', 'unknown', '콩이 & # " < >']) {
        result = render(root, 'chat.html', {}, '?with=' + encodeURIComponent(name));
        assert.equal(result.get('chat-header').querySelector('.name').textContent, '견주');
        assert.equal(new URL(result.get('chat-header').querySelector('a').href, 'https://example.test').searchParams.get('dog'), name);
        verify(result, false);
    }
    result = render(root, 'mypage.html', { petples_user: { ...user, human_name: '김 & <테스트>', pet_weight: '4.5' } });
    assert.equal(result.get('user-info').querySelector('[data-field="human_name"]').textContent, '김 & <테스트>');
    assert.equal(result.get('user-info').querySelector('[data-field="pet_weight"]').textContent, '4.5kg');
    assert.equal(result.get('user-info').querySelector('[data-field="pet_type"]').textContent, '정보 없음');
    verify(result, false);
    result = render(root, 'mypage.html');
    assert.match(result.get('user-info').innerHTML, /회원가입/);
    verify(result, false);
    result = render(root, 'chat_list.html', { petples_chat_rooms: [room] });
    const item = result.get('chat-list').children[0];
    assert.equal(item.querySelector('.name').textContent, room.name);
    assert.equal(item.querySelector('.last-message').textContent, room.lastMessage);
    assert.equal(item.querySelector('.time').textContent, room.time);
    assert.equal(new URL(item.querySelector('a').href, 'https://example.test').searchParams.get('with'), room.name);
    verify(result, false);
    result = render(root, 'chat_list.html');
    assert.match(result.get('chat-list').innerHTML, /아직 대화 상대가 없습니다/);
    verify(result, false);
    result = render(root, 'matching.html', { petples_user: user, blocked_users: [{ ...room, name: quotedMarker }] });
    const button = result.get('blocked-list').children[0].querySelector('.unblock-btn');
    result.get('blocked-list').events.click({ target: button });
    assert.deepEqual(JSON.parse(result.storage.get('blocked_users')), []);
    assert.equal(result.get('blocked-list').children[0].textContent, '차단한 사용자가 없습니다.');
    verify(result, false);
    result = render(root, 'matching.html', { petples_user: user });
    assert.equal(result.get('blocked-list').children[0].textContent, '차단한 사용자가 없습니다.');
    verify(result, false);
}

if (process.env.PETPLES_BASELINE) {
    adversarial(path.resolve(process.env.PETPLES_BASELINE), true);
    console.log('PASS: 18 baseline cases pass unsafe input to innerHTML (sink reproduction only).');
}
const before = count;
adversarial(root, false);
normal();
console.log(`PASS: ${count - before} patched cases keep untrusted input out of HTML sinks and preserve field/link behavior.`);
console.log('This is an instrumented DOM unit test, not proof of browser execution or visual correctness.');
