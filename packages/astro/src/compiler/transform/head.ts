import type { Transformer, TransformOptions } from '../../@types/transformer';
import type { TemplateNode } from '@astrojs/parser';
import { EndOfHead } from './util/end-of-head.js';

/** If there are hydrated components, inject styles for [data-astro-root] and [data-astro-children] */
export default function (opts: TransformOptions): Transformer {
  let hasComponents = false;
  let isHmrEnabled = typeof opts.compileOptions.hmrPort !== 'undefined' && opts.compileOptions.mode === 'development';
  const eoh = new EndOfHead();

  return {
    visitors: {
      html: {
        Fragment: {
          enter(node) {
            eoh.enter(node);
          },
          leave(node) {
            eoh.leave(node);
          },
        },
        InlineComponent: {
          enter(node) {
            if (hasComponents) {
              return;
            }
            // Initialize eoh if there are no elements
            eoh.enter(node);
            if (node.attributes && node.attributes.some(({ name }: any) => name?.startsWith('client:'))) {
              hasComponents = true;
              return;
            }

            /** Check for legacy hydration */
            const [_name, kind] = node.name.split(':');
            if (kind) {
              hasComponents = true;
            }
          },
          leave(node) {
            eoh.leave(node);
          },
        },
        Element: {
          enter(node) {
            eoh.enter(node);
          },
          leave(node) {
            eoh.leave(node);
          },
        },
      },
    },
    async finalize() {
      const children = [];

      /**
       * Injects an expression that adds link tags for provided css.
       * Turns into:
       * ```
       * { Astro.css.map(css => (
       *  <link rel="stylesheet" href={css}>
       * ))}
       * ```
       */

      children.push({
        start: 0,
        end: 0,
        type: 'Fragment',
        children: [
          {
            start: 0,
            end: 0,
            type: 'Expression',
            codeChunks: ['Astro.pageCSS.map(css => (', '))'],
            children: [
              {
                type: 'Element',
                name: 'link',
                attributes: [
                  {
                    name: 'rel',
                    type: 'Attribute',
                    value: [
                      {
                        type: 'Text',
                        raw: 'stylesheet',
                        data: 'stylesheet',
                      },
                    ],
                  },
                  {
                    name: 'href',
                    type: 'Attribute',
                    value: [
                      {
                        start: 0,
                        end: 0,
                        type: 'MustacheTag',
                        expression: {
                          start: 0,
                          end: 0,
                          type: 'Expression',
                          codeChunks: ['css'],
                          children: [],
                        },
                      },
                    ],
                  },
                ],
                start: 0,
                end: 0,
                children: [],
              },
            ],
          },
          {
            start: 0,
            end: 0,
            type: 'Expression',
            codeChunks: ['Astro.pageScripts.map(script => (', '))'],
            children: [
              {
                start: 0,
                end: 0,
                type: 'Expression',
                codeChunks: ['script.src ? (', ') : (', ')'],
                children: [
                  {
                    type: 'Element',
                    name: 'script',
                    attributes: [
                      {
                        type: 'Attribute',
                        name: 'type',
                        value: [
                          {
                            type: 'Text',
                            raw: 'module',
                            data: 'module'
                          }
                        ]
                      },
                      {
                        type: 'Attribute',
                        name: 'src',
                        value: [
                          {
                            start: 0,
                            end: 0,
                            type: 'MustacheTag',
                            expression: {
                              start: 0,
                              end: 0,
                              type: 'Expression',
                              codeChunks: ['script.src'],
                              children: [],
                            },
                          }
                        ]
                      },
                      {
                        type: 'Attribute',
                        name: 'data-astro',
                        value: [
                          {
                            type: 'Text',
                            raw: 'hoist',
                            data: 'hoist'
                          }
                        ]
                      }
                    ],
                    start: 0,
                    end: 0,
                    children: [],
                  },

                  { // TODO change
                    type: 'Element',
                    name: 'script',
                    attributes: [
                      {
                        type: 'Attribute',
                        name: 'type',
                        value: [
                          {
                            type: 'Text',
                            raw: 'module',
                            data: 'module'
                          }
                        ]
                      },
                      {
                        type: 'Attribute',
                        name: 'data-astro',
                        value: [
                          {
                            type: 'Text',
                            raw: 'hoist',
                            data: 'hoist'
                          }
                        ]
                      }
                    ],
                    start: 0,
                    end: 0,
                    children: [
                      {
                        start: 0,
                        end: 0,
                        type: 'MustacheTag',
                        expression: {
                          start: 0,
                          end: 0,
                          type: 'Expression',
                          codeChunks: ['script.content'],
                          children: [],
                        },
                      }
                    ],
                  },
                ]
              }
            ],
          },
        ],
      });

      if (hasComponents) {
        children.push({
          type: 'Element',
          name: 'style',
          attributes: [{ name: 'type', type: 'Attribute', value: [{ type: 'Text', raw: 'text/css', data: 'text/css' }] }],
          start: 0,
          end: 0,
          children: [
            {
              start: 0,
              end: 0,
              type: 'Text',
              data: 'astro-root, astro-fragment { display: contents; }',
              raw: 'astro-root, astro-fragment { display: contents; }',
            },
          ],
        });
      }

      if (isHmrEnabled) {
        const { hmrPort } = opts.compileOptions;
        children.push(
          {
            type: 'Element',
            name: 'script',
            attributes: [],
            children: [{ type: 'Text', data: `window.HMR_WEBSOCKET_PORT = ${hmrPort};`, start: 0, end: 0 }],
            start: 0,
            end: 0,
          },
          {
            type: 'Element',
            name: 'script',
            attributes: [
              { type: 'Attribute', name: 'type', value: [{ type: 'Text', data: 'module', start: 0, end: 0 }], start: 0, end: 0 },
              { type: 'Attribute', name: 'src', value: [{ type: 'Text', data: '/_snowpack/hmr-client.js', start: 0, end: 0 }], start: 0, end: 0 },
            ],
            children: [],
            start: 0,
            end: 0,
          }
        );
      }

      if (eoh.foundHeadOrHtmlElement || eoh.foundHeadAndBodyContent) {
        const topLevelFragment = {
          start: 0,
          end: 0,
          type: 'Fragment',
          children,
        };
        eoh.append(topLevelFragment);
      }
    },
  };
}
