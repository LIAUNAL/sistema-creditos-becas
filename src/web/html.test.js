'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { escaparHtml, html, crudo } = require('./html');

const CARGA = '<script>alert(1)</script>';

test('escaparHtml convierte los cinco caracteres especiales', () => {
  assert.strictEqual(escaparHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.strictEqual(escaparHtml(null), '');
  assert.strictEqual(escaparHtml(undefined), '');
  assert.strictEqual(escaparHtml(42), '42');
});

test('Scenario: una plantilla con un valor de usuario con <script> lo escapa y no lo deja como etiqueta', () => {
  const salida = String(html`<p>${CARGA}</p>`);
  assert.strictEqual(salida, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.ok(!salida.includes('<script>'));
});

test('las comillas que rompen un atributo se escapan', () => {
  const salida = String(html`<input value="${'" onfocus="alert(1)" x="'}">`);
  assert.ok(!salida.includes('" onfocus="'));
  assert.ok(salida.includes('&quot; onfocus=&quot;alert(1)&quot;'));
  const simple = String(html`<input value='${"' onfocus='x"}'>`);
  assert.ok(!simple.includes("' onfocus='"));
});

test('el HTML crudo requiere el marcador explícito crudo()', () => {
  assert.strictEqual(String(html`<div>${crudo('<b>confiable</b>')}</div>`), '<div><b>confiable</b></div>');
  assert.strictEqual(String(html`<div>${'<b>no</b>'}</div>`), '<div>&lt;b&gt;no&lt;/b&gt;</div>');
});

test('una plantilla anidada no se escapa dos veces y las listas se concatenan', () => {
  const item = (texto) => html`<li>${texto}</li>`;
  const salida = String(html`<ul>${[item('a&b'), item(CARGA)]}</ul>`);
  assert.strictEqual(salida, '<ul><li>a&amp;b</li><li>&lt;script&gt;alert(1)&lt;/script&gt;</li></ul>');
});
