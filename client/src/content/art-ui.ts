/** Resolve advertised UI names without assuming units and buildings share a prefix policy. */
export function artUIKeys(index: {portraits: readonly string[]; buildIcons?: readonly string[]}, id: string): {portrait?: string; build?: string} {
 if (!id || id.length >= 240 || id.includes('..') || !/^[A-Za-z0-9_.@-]+$/.test(id)) throw Error(`Invalid battlefield UI asset: ${id}`);
 const legacy = id.replace(/^(unit|building)\./, '');
 const advertised = (keys: readonly string[] | undefined) => keys?.includes(id) ? id : legacy && keys?.includes(legacy) ? legacy : undefined;
 return {portrait: advertised(index.portraits), build: advertised(index.buildIcons)};
}
