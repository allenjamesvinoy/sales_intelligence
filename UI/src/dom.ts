export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown>;

/** Properties that must be set on the element rather than as attributes. */
const PROPS = new Set(['value', 'checked', 'disabled', 'selected']);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'className') el.className = String(value);
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (PROPS.has(key)) Reflect.set(el, key, value);
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  pin: 'M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14zM8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
  phone: 'M5.6 2.5H3.8a1 1 0 0 0-1 1.1 10.5 10.5 0 0 0 9.6 9.6 1 1 0 0 0 1.1-1v-1.8l-2.6-1-1.3 1.3a7 7 0 0 1-3.2-3.2L7.7 6.2z',
  globe: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2z',
  mail: 'M2.5 4h11v8h-11zM2.5 4.5 8 9l5.5-4.5',
  clock: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 5v3.2l2 1.3',
  alert: 'M8 2.2 14.2 13H1.8zM8 6.5v3M8 11.3v.2',
  check: 'M3 8.5 6.3 11.5 13 4.5',
  info: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 7.2v4M8 5v.2',
  user: 'M8 7.5a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4zM2.8 14c.6-2.6 2.7-4.2 5.2-4.2s4.6 1.6 5.2 4.2',
  back: 'M10 3.5 5.5 8l4.5 4.5',
  chat: 'M2.5 3.5h11v7.5h-6.5l-3.5 2.5v-2.5h-1z',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  mic: 'M8 10.5a2.5 2.5 0 0 0 2.5-2.5V4a2.5 2.5 0 0 0-5 0v4A2.5 2.5 0 0 0 8 10.5zM4 7.5a4 4 0 0 0 8 0M8 11.5V14',
  stop: 'M4.5 4.5h7v7h-7z',
  send: 'M2.5 8h9M8.5 4.5 12 8l-3.5 3.5',
  moon: 'M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z',
  sun: 'M8 10.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'lb-ico');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICON_PATHS[name]);
  svg.appendChild(path);
  return svg;
}
