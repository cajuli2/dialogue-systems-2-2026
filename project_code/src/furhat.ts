import {setup, fromPromise, assign, sendParent} from "xstate";

// URI gets forwarded by vite
const FURHATURI = "";

// reusing some code from lab 3


async function fhPost(path: string, body = "") {
    const myHeaders = new Headers();
    myHeaders.append("accept", "application/json");
    return fetch(`${FURHATURI}${path}`, {
        method: "POST",
        headers: myHeaders,
        body,
    })
}

async function fhSay(text: string) {
    const encodedText = encodeURIComponent(text);
    return fhPost(`/furhat/say?text=${encodedText}&blocking=true`);
}

async function attendUser() {
    return fhPost(`/furhat/attend?user=CLOSEST`);
}

// NOTE: turned off LEDs for now - might put them back in later
async function switchLED(red: number, green: number, blue: number) {
    return fhPost(`/furhat/led?red=${red}&green=${green}&blue=${blue}`);
}


// switch to red LED while furhat speaks
// call the pre-built fhSay from within function
async function redLED(text: string) {
    //await switchLED(255, 0, 0); // red light
    const result = await fhSay(text); // furhat speaks, wait till done
    //await switchLED(0,0,0); // turn LED off again
    return result;
}

// switch to green LED while furhat listens
// call the pre-built fhListen from within function
async function greenLED() {
    //await switchLED(0, 255, 0); // green light
    const result = await fhListen(); // furhat listens, wait till done
    //await switchLED(0,0,0); // turn LED off again
    return result;
}

async function fhListen(): Promise<string> {
    const myHeaders = new Headers();
    myHeaders.append("accept", "application/json");
    const response = await fetch(`${FURHATURI}/furhat/listen`, {
        method: "GET",
        headers: myHeaders,
    });
    const json = JSON.parse(await response.text());
    return json.message ?? "";
}

async function fhCustomGesture(name: string, frames: object[]) {
    return fhPost(
        `/furhat/gesture?blocking=false`,
        JSON.stringify({name, frames, class: "furhatos.gestures.Gesture"}),
    );
}

// uncertainty expressions below, 3 levels
async function level_2_uncertainty(){
    return fhCustomGesture("gaze", [
        {
            time: [1, 2.0],
            persist: true,
            params: { // look up and to the left, hold for 0.8s
                LOOK_UP: 0.6,
                LOOK_RIGHT: 0,
                LOOK_LEFT: 0.6,
            },
        },
        {
            time: [2.25],
            persist: true,
            params: { // quickly look up and to the right, hold for 0.25s
                LOOK_UP: 0.6,
                LOOK_RIGHT: 0.6,
                LOOK_LEFT: 0,
            },
        },
        {
            time: [2.5, 3.75],
            persist: true,
            params: { // quickly look back to the left, hold for 0.5s
                LOOK_UP: 0.6,
                LOOK_RIGHT: 0,
                LOOK_LEFT: 0.6,
            },
        },
        {
            // look back at user
            time: [4.25],
            persist: true,
            params: {reset: true},
        },
    ]);
}

async function level_3_uncertainty(){
    return fhCustomGesture("head_tilt", [
        {
            time: [1.0, 3.75],
            persist: true,
            params: { // tilt head to the side and hold until 2.1s
                NECK_ROLL: 10,
            },
        },
        {
            time: [4.25],
            persist: true,
            params: { reset: true },
        },
    ]);
}

async function level_4_uncertainty(){
    return fhCustomGesture("frown", [
        {
            time: [1.0, 3.75],
            persist: true,
            params: { // frown and hold until 2.1s
                BROW_DOWN_LEFT: 0.7,
                BROW_DOWN_RIGHT: 0.7,
                BROW_IN_LEFT: 0.6,
                BROW_IN_RIGHT: 0.6,

            },
        },
        {
            time: [4.25],
            persist: true,
            params: { reset: true },
        },
    ]);
}

async function level_5_uncertainty(){
    return fhCustomGesture("funny_face", [
        {
            time: [1.0, 3.75],
            persist: true,
            params: {
                // frown
                BROW_DOWN_LEFT: 1.0,
                BROW_DOWN_RIGHT: 1.0,
                BROW_IN_LEFT: 1.0,
                BROW_IN_RIGHT: 1.0,

                // look up and to the left
                LOOK_UP: 1.0,
                LOOK_LEFT: 1.0,

                // squint eyes
                EYE_SQUINT_LEFT: 0.8,
                EYE_SQUINT_RIGHT: 0.8,

                // mouth corners down
                MOUTH_FROWN_LEFT: 1.0,
                MOUTH_FROWN_RIGHT: 1.0,

                // tilt head
                NECK_ROLL: 8,
            },
        },
        {
            time: [4.25],
            persist: true,
            params: { reset: true },
        },
    ]);
}

// function that selects which uncertainty level to trigger
async function expressUncertainty(level: number) {
    switch (level) {
        case 2: return level_2_uncertainty();
        case 3: return level_3_uncertainty();
        case 4: return level_4_uncertainty();
        case 5: return level_5_uncertainty();
        default:
            return;
    }
}

const wait_before_speaking = 2600;

// start the expression
async function speakWithUncertainty(text: string, level: number) {
    if (level > 0) {
        console.log(`Uncertainty level: ${level}`);
        await expressUncertainty(level);
        await new Promise((resolve) => setTimeout(
            resolve, wait_before_speaking
            ));
    }
    return redLED(text);
}

// Using Azure CLU instead of SpeechState
async function analyzeWithCLU(text: string, credentials: any) {
    try {
        const response = await fetch(credentials.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Ocp-Apim-Subscription-Key": credentials.key,
            },
            body: JSON.stringify({
                kind: "Conversation",
                analysisInput: {
                    conversationItem: {
                        id: "1",
                        participantId: "user",
                        text,
                        modality: "text",
                        language: "en-us"
                    },
                },
                parameters: {
                    projectName: credentials.projectName,
                    deploymentName: credentials.deploymentName,
                    verbose: true,
                    stringIndexType: "TextElement_V8",
                },
            }),
        });
        const data = await response.json();
        if (!response.ok) { console.error("CLU HTTP Error: ", response.status, data)};
        return data?.result?.prediction ?? null;
    } catch (e) {
        console.error("CLU error: ", e);
        return null;
    }
}

const NO_INPUT = ["", "SILENCE", "FAILED", "INTERRUPTED", "NOMATCH"];

async function listen(nlu: boolean, credentials: any) {
    const message = (await greenLED()).trim();
    console.log("furhat heard:", JSON.stringify(message));
    const status = message.toUpperCase().replace(/[^A-Z]/g, "");
    if (NO_INPUT.includes(status)) return { utterance: "", nluValue: null};
    const nluValue = nlu ? await analyzeWithCLU(message, credentials) : null;
    return { utterance: message, nluValue };
}

// actor dm.ts that spawns, todo: explain better
type FurhatEvents =
    | {type: "PREPARE"}
    | {type: "SPEAK"; value: {
        utterance: string;
        uncertainty?: number
    } }
| {type: "LISTEN"; value?: {nlu?: boolean}};

export const furhatState = setup({
    types: {
        context: {} as { settings: any; utterance: string; uncertainty: number, nlu: boolean },
        input: {} as any,
        events: {} as FurhatEvents,
    },
    actors: {
        attend: fromPromise<any, null>(async ()  => attendUser()),
        speak: fromPromise<any, {utterance: string; uncertainty: number}>(async ({ input }) =>
            speakWithUncertainty(input.utterance, input.uncertainty),
        ),
        listen: fromPromise<{ utterance: string; nluValue: any}, {nlu: boolean, credentials: any }> (
            async ({ input }) => listen(input.nlu, input.credentials),
        ),
    },
}).createMachine({
    id: "furhat",
    context: ({ input}) => ({ settings: input, utterance: "", uncertainty: 0, nlu: false}),
    initial: "WaitForPrepare",
    on: {
        SPEAK: {
            target: ".Speaking",
            reenter: true,
            actions: assign({
                utterance: ({ event }) => event.value.utterance,
                uncertainty: ({ event }) => event.value.uncertainty ?? 0,
            }),
        },
        LISTEN: {
            target: ".Listening",
            reenter: true,
            actions: assign({ nlu: ({event}) => event.value?.nlu ?? false}),
        },
    },
    states: {
        WaitForPrepare: {
            meta: { view: "idle"},
            on: { PREPARE: "Prepare"},
        },
        Prepare: {
            meta: { view: "preparing"},
            invoke: {
                src: "attend",
                input: null,
                onDone: { target: "Idle", actions: sendParent({ type: "ASRTTS_READY"})},
                onError: {
                    target: "Idle",
                    actions: [({ event }) => console.error(event), sendParent({
                        type: "ASRTTS_READY" })],
                },
            },
        },
        Idle: {
            meta: { view: "idle" },
        },
        Speaking: {
            meta: { view: "speaking"},
            invoke: {
                src: "speak",
                input: ({ context }) => ({ utterance: context.utterance, uncertainty: context.uncertainty }),
                onDone: { target: "Idle", actions: sendParent({ type: "SPEAK_COMPLETE"})},
                onError: {
                    target: "Idle",
                    actions: [({ event }) => console.error(event), sendParent({type: "SPEAK_COMPLETE"})],
                },
            },
        },
        Listening: {
            meta: {view: "recognizing"},
            invoke: {
                src: "listen",
                input: ({ context }) => ({
                    nlu: context.nlu,
                    credentials: context.settings.azureLanguageCredentials,
                }),
                onDone: [
                    {
                        // nothing heard
                        guard: ({event}) => event.output.utterance === "",
                        target: "Idle",
                        actions: [sendParent({type: "ASR_NOINPUT"}), sendParent({type: "LISTEN_COMPLETE"})],
                    },
                    {
                        target: "Idle",
                        actions: [
                            sendParent(({event}) => ({
                                type: "RECOGNISED",
                                value: [{ utterance: event.output.utterance, confidence: 1}],
                                nluValue: event.output.nluValue,
                            })),
                            sendParent({ type: "LISTEN_COMPLETE"}),
                        ],
                    },
                ],
                onError: {
                    target: "Idle",
                    actions: [
                        ({ event}) => console.error(event),
                        sendParent({ type: "ASR_NOINPUT"}),
                        sendParent({ type: "LISTEN_COMPLETE"}),
                    ],
                },
            },
        },
    },
});
