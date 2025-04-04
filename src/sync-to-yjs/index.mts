import * as Y from 'yjs';

export type TSupported =
    | string
    | number
    | boolean
    | null
    | TSupported[]
    | {
          [key: string]: TSupported;
      };

export type TCommonOptions = {
    doc: Y.Doc;
    mergeObjects?: boolean;
};

export function syncToY<T extends {}>(options: TCommonOptions & { value: T; to?: Y.Map<any> }): Y.Map<any>;
export function syncToY<T extends TSupported[]>(
    options: TCommonOptions & { value: T; to?: Y.Array<any> },
): Y.Array<any>;
export function syncToY(options: TCommonOptions & { value: null }): null;
export function syncToY(options: TCommonOptions & { value: boolean }): boolean;
export function syncToY(options: TCommonOptions & { value: number }): number;
export function syncToY(options: TCommonOptions & { value: string }): string;
export function syncToY<T extends TSupported>(
    options: TCommonOptions & {
        value: T;
        to?: Y.Map<any> | Y.Array<any>;
    },
): string | number | boolean | null | Y.Array<any> | Y.Map<any> {
    const doc = options.doc;
    const value = options.value;
    const to = options.to;

    if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' || value === null) {
        return value;
    } else if (Array.isArray(value)) {
        if (!to) {
            return Y.Array.from(
                value.map((value) =>
                    syncToY({
                        ...options,
                        value: value as any,
                        to: undefined,
                    }),
                ) as any[],
            );
        } else {
            if (!(to instanceof Y.Array)) {
                throw new Error('`to` must be an instance of Y.Array, Y.Map given');
            }

            options.doc.transact(() => {
                const till = Math.min(to.length, value.length);

                for (let i = 0; i < till; i++) {
                    if (typeof value[i] === 'object' && to.get(i) instanceof Y.Map) {
                        syncToY({
                            ...options,
                            value: value[i] as any,
                            to: to.get(i) as Y.Map<any>,
                        });
                    } else if (Array.isArray(value[i]) && to.get(i) instanceof Y.Array) {
                        syncToY({
                            doc,
                            value: value[i] as any[],
                            to: to.get(i) as Y.Array<any>,
                        });
                    } else if (value[i] !== to.get(i)) {
                        to.delete(i, 1);
                        to.insert(i, [
                            syncToY({
                                doc,
                                value: value[i] as any,
                            }),
                        ]);
                    }
                }

                if (to.length > value.length) {
                    // truncate
                    to.delete(value.length, to.length - value.length);
                } else {
                    // append
                    to.insert(
                        to.length,
                        value.slice(to.length).map((item) =>
                            syncToY({
                                doc,
                                value: item as any,
                            }),
                        ),
                    );
                }
            });

            return to;
        }
    } else if (typeof value === 'object') {
        if (!to) {
            const ymap = new Y.Map<any>();

            for (const key in value) {
                ymap.set(
                    key,
                    syncToY({
                        doc,
                        value: value[key] as any,
                    }),
                );
            }

            return ymap;
        } else {
            if (!(to instanceof Y.Map)) {
                throw new Error('`to` must be an instance of Y.Map, Y.Array given');
            }

            doc.transact(() => {
                const keys = to.keys();
                const valueKeySet = new Set<string>();

                for (const key in value) {
                    valueKeySet.add(key);

                    if (!to.has(key)) {
                        to.set(
                            key,
                            syncToY({
                                ...options,
                                value: value[key] as any,
                                to: undefined,
                            }),
                        );
                    } else {
                        if (typeof value[key] === 'undefined') {
                            to.delete(key);
                        } else if (typeof value[key] === 'object' && to.get(key) instanceof Y.Map) {
                            syncToY({
                                ...options,
                                value: value[key] as any,
                                to: to.get(key) as Y.Map<any>,
                            });
                        } else if (Array.isArray(value[key]) && to.get(key) instanceof Y.Array) {
                            syncToY({
                                ...options,
                                value: value[key] as any[],
                                to: to.get(key) as Y.Array<any>,
                            });
                        } else if (value[key] !== to.get(key)) {
                            to.set(
                                key,
                                syncToY({
                                    ...options,
                                    value: value[key] as any,
                                    to: undefined,
                                }),
                            );
                        }
                    }
                }

                if (!options.mergeObjects) {
                    for (const key of keys) {
                        if (!valueKeySet.has(key)) {
                            to.delete(key);
                        }
                    }
                }
            });

            return to;
        }
    } else {
        throw new Error(`unsupported type ${typeof value}`);
    }
}
