import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import * as Y from 'yjs';
import { syncToY } from './sync-to-yjs/index.mjs';

export type TOptions = {
    key?: string;
};

export type JSONAble =
    | null
    | boolean
    | number
    | string
    | Array<JSONAble>
    | {
          [key: string]: JSONAble | undefined;
      };

export type TConfigurationOptions = {
    appKey: string;
    server: string;
    telemetry: boolean;
};

export const configuration: Partial<TConfigurationOptions> = {};

export function configure(options: Partial<TConfigurationOptions>) {
    Object.assign(configuration, options);
}

export function b64ToUint8Array(b64: string) {
    const binaryString = atob(b64);

    const len = binaryString.length;
    const uint8Array = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }

    return uint8Array;
}

export function useForceUpdate() {
    const [, forceUpdate] = useReducer((x) => !x, false);
    return forceUpdate;
}

export function useSharedState<T extends JSONAble>(
    initialState: T | (() => T),
    options?: TOptions,
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
    const [initialComputedState] = useState<T>(initialState);
    const [doc] = useState<Y.Doc>(() => new Y.Doc());

    const publicStateRef = useRef<T>(initialComputedState);
    const readyRef = useRef(false);

    const forceUpdate = useForceUpdate();

    useEffect(() => {
        const host = window.location.host;
        const key = options?.key ?? window.location.pathname;

        const searchParams = new URL(configuration.server ? configuration.server : `wss://socket.airstate.dev/y/main`);

        searchParams.searchParams.append('host', host);
        searchParams.searchParams.append('key', key);

        if (configuration?.appKey) {
            searchParams.searchParams.append('app-id', configuration.appKey);
        }

        const ws = new WebSocket(`wss://socket.airstate.dev/y/main?${searchParams}`);

        const freshDoc = new Y.Doc();
        const freshDocMain = freshDoc.getMap('main');

        syncToY({
            doc: freshDoc,
            value: {
                data: initialComputedState,
            },
            to: freshDocMain,
        });

        const encodedInitialState = Y.encodeStateAsUpdateV2(freshDoc);
        const base64InitialState = btoa(String.fromCharCode.apply(null, Array.from(encodedInitialState)));

        ws.onopen = () => {
            ws.send(
                JSON.stringify({
                    type: 'init',
                    initialEncodedState: base64InitialState,
                }),
            );
        };

        doc.on('updateV2', (update, origin) => {
            if (origin !== 'remote') {
                ws.send(
                    JSON.stringify({
                        type: 'update',
                        encodedUpdate: btoa(String.fromCharCode.apply(null, Array.from(update))),
                    }),
                );
            }
        });

        ws.onmessage = (message) => {
            const m = JSON.parse(message.data);

            if (m.type === 'first') {
                Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(freshDoc), 'remote');

                readyRef.current = true;
                publicStateRef.current = doc.getMap('main').toJSON().data;

                forceUpdate();
            } else if (m.type === 'init') {
                const encodedUpdate = m.initialEncodedState;
                const uint8Array = b64ToUint8Array(encodedUpdate);

                Y.applyUpdateV2(doc, uint8Array, 'remote');

                syncToY({
                    doc: doc,
                    value: { data: initialComputedState },
                    to: doc.getMap('main'),
                    mergeObjects: true,
                });

                publicStateRef.current = doc.getMap('main').toJSON().data;

                if (!readyRef.current) {
                    readyRef.current = true;
                }

                forceUpdate();
            } else if (m.type === 'update') {
                const encodedUpdate = m.encodedUpdate;
                const uint8Array = b64ToUint8Array(encodedUpdate);

                Y.applyUpdateV2(doc, uint8Array, 'remote');
                publicStateRef.current = doc.getMap('main').toJSON().data;

                forceUpdate();
            }
        };
    }, []);

    const setState = useCallback((value: T | ((prev: T) => T)) => {
        const nextValue = value instanceof Function ? value(publicStateRef.current) : value;

        syncToY({
            doc: doc,
            value: {
                data: nextValue,
            },
            to: doc.getMap('main'),
        });

        publicStateRef.current = doc.getMap('main').toJSON().data;
        forceUpdate();
    }, []);

    return [publicStateRef.current, setState, readyRef.current];
}
