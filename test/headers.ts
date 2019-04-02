import fs from 'fs';
import {promisify} from 'util';
import path from 'path';
import test from 'ava';
import FormData from 'form-data';
import got from '../source';
import supportsBrotli from '../source/utils/supports-brotli';
import pkg from '../package.json';
import withServer from './helpers/with-server';

const echoHeaders = (request, response) => {
	request.resume();
	response.end(JSON.stringify(request.headers));
};

test('`user-agent`', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const headers = await got('').json();
	t.is(headers['user-agent'], `${pkg.name}/${pkg.version} (https://github.com/sindresorhus/got)`);
});

test('`accept-encoding`', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const headers = await got('').json();
	t.is(headers['accept-encoding'], supportsBrotli ? 'gzip, deflate, br' : 'gzip, deflate');
});

test('does not override provided `accept-encoding`', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const headers = await got({
		headers: {
			'accept-encoding': 'gzip'
		}
	}).json();
	t.is(headers['accept-encoding'], 'gzip');
});

test('does not remove user headers from `url` object argument', withServer, async (t, server) => {
	server.get('/', echoHeaders);

	const headers = (await got({
		hostname: server.hostname,
		port: server.port,
		responseType: 'json',
		protocol: 'http:',
		headers: {
			'X-Request-Id': 'value'
		}
	})).body;

	t.is(headers.accept, 'application/json');
	t.is(headers['user-agent'], `${pkg.name}/${pkg.version} (https://github.com/sindresorhus/got)`);
	t.is(headers['accept-encoding'], supportsBrotli ? 'gzip, deflate, br' : 'gzip, deflate');
	t.is(headers['x-request-id'], 'value');
});

test('does not set `accept-encoding` header when `options.decompress` is false', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const headers = await got({
		decompress: false
	}).json();
	t.false(Reflect.has(headers, 'accept-encoding'));
});

test('`accept` header with `json` option', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	let headers = await got('').json();
	t.is(headers.accept, 'application/json');

	headers = await got({
		headers: {
			accept: ''
		}
	}).json();
	t.is(headers.accept, '');
});

test('`host` header', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const headers = await got('').json();
	t.is(headers.host, `localhost:${server.port}`);
});

test('transforms names to lowercase', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const headers = (await got({
		headers: {
			'ACCEPT-ENCODING': 'identity'
		},
		responseType: 'json'
	})).body;
	t.is(headers['accept-encoding'], 'identity');
});

test('setting `content-length` to 0', withServer, async (t, server, got) => {
	server.post('/', echoHeaders);

	const {body} = await got.post({
		headers: {
			'content-length': 0
		},
		body: 'sup'
	});
	const headers = JSON.parse(body);
	t.is(headers['content-length'], '0');
});

test('sets `content-length` to `0` when requesting PUT with empty body', withServer, async (t, server, got) => {
	server.put('/', echoHeaders);

	const {body} = await got({
		method: 'PUT'
	});
	const headers = JSON.parse(body);
	t.is(headers['content-length'], '0');
});

test('form-data manual `content-type` header', withServer, async (t, server, got) => {
	server.post('/', echoHeaders);

	const form = new FormData();
	form.append('a', 'b');
	const {body} = await got.post({
		headers: {
			'content-type': 'custom'
		},
		body: form
	});
	const headers = JSON.parse(body);
	t.is(headers['content-type'], 'custom');
});

test('form-data automatic `content-type` header', withServer, async (t, server, got) => {
	server.post('/', echoHeaders);

	const form = new FormData();
	form.append('a', 'b');
	const {body} = await got.post({
		body: form
	});
	const headers = JSON.parse(body);
	t.is(headers['content-type'], `multipart/form-data; boundary=${form.getBoundary()}`);
});

test('form-data sets `content-length` header', withServer, async (t, server, got) => {
	server.post('/', echoHeaders);

	const form = new FormData();
	form.append('a', 'b');
	const {body} = await got.post({body: form});
	const headers = JSON.parse(body);
	t.is(headers['content-length'], '157');
});

test('stream as `options.body` sets `content-length` header', withServer, async (t, server, got) => {
	server.post('/', echoHeaders);

	const fixture = path.join(__dirname, 'fixtures/stream-content-length');
	const {size} = await promisify(fs.stat)(fixture);
	const {body} = await got.post({
		body: fs.createReadStream(fixture)
	});
	const headers = JSON.parse(body);
	t.is(Number(headers['content-length']), size);
});

test('buffer as `options.body` sets `content-length` header', withServer, async (t, server, got) => {
	server.post('/', echoHeaders);

	const buffer = Buffer.from('unicorn');
	const {body} = await got.post({
		body: buffer
	});
	const headers = JSON.parse(body);
	t.is(Number(headers['content-length']), buffer.length);
});

test('removes null value headers', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const {body} = await got({
		headers: {
			'user-agent': null
		}
	});
	const headers = JSON.parse(body);
	t.false(Reflect.has(headers, 'user-agent'));
});

test('setting a header to undefined keeps the old value', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const {body} = await got({
		headers: {
			'user-agent': undefined
		}
	});
	const headers = JSON.parse(body);
	t.not(headers['user-agent'], undefined);
});

test('non-existent headers set to undefined are omitted', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const {body} = await got({
		headers: {
			blah: undefined
		}
	});
	const headers = JSON.parse(body);
	t.false(Reflect.has(headers, 'blah'));
});

test('preserve port in host header if non-standard port', withServer, async (t, server, got) => {
	server.get('/', echoHeaders);

	const body = await got('').json();
	t.is(body.host, `localhost:${server.port}`);
});

test('strip port in host header if explicit standard port (:80) & protocol (HTTP)', async t => {
	const body = await got('http://httpbin.org:80/headers').json();
	t.is(body.headers.Host, 'httpbin.org');
});

test('strip port in host header if explicit standard port (:443) & protocol (HTTPS)', async t => {
	const body = await got('https://httpbin.org:443/headers').json();
	t.is(body.headers.Host, 'httpbin.org');
});

test('strip port in host header if implicit standard port & protocol (HTTP)', async t => {
	const body = await got('http://httpbin.org/headers').json();
	t.is(body.headers.Host, 'httpbin.org');
});

test('strip port in host header if implicit standard port & protocol (HTTPS)', async t => {
	const body = await got('https://httpbin.org/headers').json();
	t.is(body.headers.Host, 'httpbin.org');
});