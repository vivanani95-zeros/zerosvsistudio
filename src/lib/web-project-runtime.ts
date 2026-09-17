export const WEB_PREVIEW_RUNTIME_VERSION = "2.0";

/** Runtime contract used by Zeros website previews: browser JS, DOM events, storage, navigation and QA hooks. */
export const WEB_PREVIEW_CONTRACT = `
- Browser JavaScript executes normally inside the isolated preview.
- Generated local HTML pages are routed in-place; never navigate the parent Zeros application.
- Runtime errors, rejected promises and console errors are reported to the preview host.
- Screenshot and verification commands are handled inside the preview.
- Forms, timers, DOM APIs and localStorage are available to generated client-side code.
- Internal .html links must resolve to another generated file.
`;
