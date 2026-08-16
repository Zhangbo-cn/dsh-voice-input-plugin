window.__ModuleLoader__.load({
	id: "@zhangbo-cn/dsh-client-ui-voice-input",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/speech.ts
		/**
		* Resolve the browser SpeechRecognition constructor (webkit-prefixed for
		* older Chrome/Edge), or undefined when the browser does not support it.
		* @returns the constructor, or undefined when unsupported.
		*/
		function resolveSpeechRecognition() {
			if (typeof window === "undefined") return void 0;
			const anyWindow = window;
			return anyWindow.SpeechRecognition ?? anyWindow.webkitSpeechRecognition;
		}
		/**
		* Create a browser recognition instance, or null when unsupported.
		* @returns a fresh recognition, or null when the browser lacks Web Speech.
		*/
		function createBrowserRecognition() {
			const ctor = resolveSpeechRecognition();
			return ctor === void 0 ? null : new ctor();
		}
		/**
		* Accumulates recognition transcript into a final + interim model. Interim
		* segments replace each other (live feedback) while final segments commit;
		* the full transcript is what the mic appends to the draft.
		*/
		var TranscriptAccumulator = class {
			finalParts = [];
			interimText = "";
			/** Commit one final segment. */
			appendFinal(text) {
				this.finalParts.push(text);
				this.interimText = "";
			}
			/** Replace the current interim segment (live, non-committed). */
			setInterim(text) {
				this.interimText = text;
			}
			/** The full accumulated transcript (final segments + latest interim). */
			get transcript() {
				return [...this.finalParts, this.interimText].filter((part) => part.length > 0).join(" ");
			}
			/** Whether any final segment has committed. */
			get isFinal() {
				return this.finalParts.length > 0;
			}
			/** Start a fresh recognition session. */
			reset() {
				this.finalParts = [];
				this.interimText = "";
			}
		};
		/**
		* Fold one recognition result event into the accumulator.
		* @param acc - the accumulator to fold into.
		* @param event - the result event (results before `resultIndex` are unchanged).
		*/
		function applyResults(acc, event) {
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				if (result === void 0) continue;
				const text = result[0]?.transcript ?? "";
				if (result.isFinal) acc.appendFinal(text);
				else acc.setInterim(text);
			}
		}
		/** Pick a natural (preferred) voice: Microsoft neural / Edge voices, else any Chinese voice. */
		function pickPreferredVoice() {
			const voices = window.speechSynthesis?.getVoices?.() ?? [];
			if (voices.length === 0) return void 0;
			const natural = voices.find((v) => /natural/i.test(v.name) || v.name.includes("Online"));
			if (natural !== void 0) return natural;
			return voices.find((v) => /zh/i.test(v.lang)) ?? voices[0];
		}
		/**
		* A TTS speaker over `speechSynthesis`, preferring a natural (Edge/neural)
		* voice. NOTE: browser `speechSynthesis` is best-effort — Chrome silently
		* drops `speak()` calls after ~15s of speech inactivity, so we `resume()`
		* (and cancel) before every utterance as the known workaround. Quality and
		* reliability are browser-vendor dependent.
		*/
		function createBrowserSpeaker() {
			const synth = window.speechSynthesis;
			const voice = pickPreferredVoice();
			return {
				get speaking() {
					return synth.speaking;
				},
				onend: null,
				speak(text) {
					if (text.trim().length === 0) return;
					synth.cancel();
					synth.resume();
					const utterance = new SpeechSynthesisUtterance(text);
					if (voice !== void 0) utterance.voice = voice;
					utterance.rate = 1;
					utterance.pitch = 1;
					utterance.onend = () => this.onend?.();
					utterance.onerror = () => this.onend?.();
					synth.speak(utterance);
				},
				stop() {
					synth.cancel();
				}
			};
		}
		/**
		* Shared Web Audio context. Resumed inside the mic gesture so reply playback
		* through it is exempt from the browser autoplay policy (a plain
		* `HTMLMediaElement.play()` is blocked when it runs after the gesture window).
		*/
		let replyAudioCtx;
		/**
		* Unlock reply audio within a user gesture (the mic pointer-down): create and
		* resume the shared AudioContext so the reply is later playable. No-op when
		* Web Audio is unavailable — playback falls back to an `<audio>` element,
		* which is allowed once the user has interacted with the page.
		*/
		function unlockReplyAudio() {
			try {
				replyAudioCtx ??= new AudioContext();
				if (replyAudioCtx.state === "suspended") replyAudioCtx.resume();
			} catch {
				replyAudioCtx = void 0;
			}
		}
		/**
		* A TTS speaker preferring the host `/api/tts` route — Edge neural voices
		* synthesized server-side and served as MP3 — and falling back to the browser
		* `speechSynthesis` when the route is unreachable or fails. Playback runs
		* through the gesture-unlocked Web Audio context when available, else an
		* `<audio>` element, so it is not subject to the autoplay policy.
		*/
		function createReplySpeaker(fetchImpl = globalThis.fetch.bind(globalThis)) {
			const audio = new Audio();
			let browser;
			let speaking = false;
			let onEnd = null;
			let activeSource = null;
			let activeUrl = null;
			const finish = () => {
				speaking = false;
				activeSource = null;
				activeUrl = null;
				onEnd?.();
			};
			/** Play a synthesized MP3, preferring Web Audio; an `<audio>` element is the fallback. */
			const playBuffer = async (buffer) => {
				const ctx = replyAudioCtx;
				if (ctx !== void 0) try {
					const decoded = await ctx.decodeAudioData(buffer.slice(0));
					const source = ctx.createBufferSource();
					source.buffer = decoded;
					source.connect(ctx.destination);
					source.onended = () => {
						activeSource = null;
						finish();
					};
					activeSource = source;
					source.start();
					return;
				} catch {}
				const url = URL.createObjectURL(new Blob([buffer], { type: "audio/mpeg" }));
				activeUrl = url;
				audio.src = url;
				audio.onended = () => {
					activeUrl = null;
					finish();
				};
				audio.onerror = () => {
					const u = activeUrl;
					activeUrl = null;
					if (u !== null) URL.revokeObjectURL(u);
					finish();
				};
				try {
					await audio.play();
				} catch (error) {
					const u = activeUrl;
					activeUrl = null;
					if (u !== null) URL.revokeObjectURL(u);
					throw error;
				}
			};
			/**
			* Stop every playback path without firing the end callback (a manual stop
			* must not look like a natural end to the caller's queue logic).
			*/
			const stopAll = () => {
				if (activeSource !== null) {
					activeSource.onended = null;
					try {
						activeSource.stop();
					} catch {}
					activeSource = null;
				}
				audio.onended = null;
				audio.pause();
				const url = activeUrl;
				activeUrl = null;
				if (url !== null) URL.revokeObjectURL(url);
				browser?.stop();
				browser = void 0;
				speaking = false;
			};
			return {
				get speaking() {
					return speaking;
				},
				get onend() {
					return onEnd;
				},
				set onend(callback) {
					onEnd = callback;
				},
				speak(text) {
					if (text.trim().length === 0) return;
					stopAll();
					speaking = true;
					fetchImpl(`/api/tts?text=${encodeURIComponent(text)}`).then((response) => {
						if (!response.ok) throw new Error(`host TTS responded ${response.status}`);
						return response.arrayBuffer();
					}).then((buffer) => playBuffer(buffer)).catch(() => {
						console.warn("[dsh-voice] host /api/tts failed; falling back to browser speechSynthesis");
						const fallback = createBrowserSpeaker();
						fallback.onend = finish;
						browser = fallback;
						fallback.speak(text);
					});
				},
				stop() {
					stopAll();
				}
			};
		}
		//#endregion
		//#region src/client/MicButton.tsx
		/**
		* The single composer voice control:
		* - tap → toggle continuous monitoring: speech streams into the draft live
		*   (逐字输入). Monitoring keeps listening across silences by auto-restarting
		*   the recognizer on each segment end (Chrome's `continuous: true` fails to
		*   deliver results, so each segment runs `continuous: false` and restarts).
		* - press-and-hold → voice chat (record while held, release to send; the reply
		*   is read aloud).
		* Recognition starts on pointer-down (a user gesture, required by the Web
		* Speech API); tap vs hold is decided on release.
		* @module @zhangbo-cn/dsh-client-ui-voice-input/src/client/MicButton
		*/
		/** How long a press must be held before release counts as "hold to chat". */
		const HOLD_THRESHOLD = 250;
		/** DeepSeek brand blue, used while the mic is listening. */
		const DEEPSEEK_BLUE = "#4d6bfe";
		/** Extract the assistant's visible text blocks from the streaming partial reply. */
		function extractPartialText(partial) {
			if (partial === null || partial === void 0) return "";
			return partial.blocks.filter((block) => block.kind === "text").map((block) => block.text ?? "").join("");
		}
		/** Sentence-end delimiters used to cut streamed text into speakable segments. */
		const SENTENCE_END = /[。！？!?…\n]$/;
		/** Flush a buffered (delimiter-less) sentence once it gets this long, so long sentences still stream. */
		const STREAM_FLUSH_CHARS = 30;
		/**
		* Split streamed reply text into speakable segments: completed sentences plus
		* delimiter-less runs past {@link STREAM_FLUSH_CHARS}. Each segment carries its
		* end offset in `text` so the caller can track how much has been handed to TTS
		* (the trailing incomplete sentence stays un-spoken and is re-evaluated later).
		*/
		function splitStreamSegments(text) {
			const result = [];
			const parts = text.match(/[^。！？!?…\n]+[。！？!?…\n]*/g) ?? [];
			let end = 0;
			for (const part of parts) {
				end += part.length;
				const trimmed = part.trim();
				if (trimmed.length === 0) continue;
				if (SENTENCE_END.test(trimmed) || trimmed.length >= STREAM_FLUSH_CHARS) result.push({
					segment: trimmed,
					end
				});
			}
			return result;
		}
		/** Length of the longest common prefix of two strings. */
		function commonPrefixLength(left, right) {
			const max = Math.min(left.length, right.length);
			let i = 0;
			while (i < max && left.charCodeAt(i) === right.charCodeAt(i)) i++;
			return i;
		}
		/**
		* The mic control. `useInput`/`useSession`/`inputActions` come from the
		* conversation standard kit; `language`/`interimResults` come from the
		* plugin's injected config face.
		*/
		function MicButton({ useInput, useSession, inputActions, t, language, interimResults }) {
			const draft = useInput((state) => state.draft);
			const chatNodes = useSession((state) => state.chat.legacy.nodes);
			const chatNodesRef = (0, react.useRef)(chatNodes);
			chatNodesRef.current = chatNodes;
			const [micState, setMicState] = (0, react.useState)("idle");
			const [readingReply, setReadingReply] = (0, react.useState)(false);
			const recRef = (0, react.useRef)(null);
			const monitoringRef = (0, react.useRef)(false);
			const baseRef = (0, react.useRef)("");
			const accRef = (0, react.useRef)(new TranscriptAccumulator());
			const holdTimerRef = (0, react.useRef)(null);
			const holdingRef = (0, react.useRef)(false);
			const wasListeningRef = (0, react.useRef)(false);
			const setByUsRef = (0, react.useRef)(false);
			const lastDraftRef = (0, react.useRef)("");
			const chatArmedRef = (0, react.useRef)(false);
			const replySeqRef = (0, react.useRef)(-1);
			const lastUserSeqRef = (0, react.useRef)(-1);
			const micUsedAtRef = (0, react.useRef)(0);
			const speakerRef = (0, react.useRef)(null);
			if (speakerRef.current === null) speakerRef.current = createReplySpeaker();
			/** Stop the live recognizer and suppress its handlers, leaving monitoring state intact. */
			const pauseRecognizer = () => {
				const rec = recRef.current;
				recRef.current = null;
				if (rec !== null) {
					rec.onend = () => {};
					rec.onerror = () => {};
					rec.stop();
				}
			};
			/** The streaming reply partial, subscribed so reply reading starts while the model is still generating. */
			const partial = useSession((state) => state.partial);
			/** Whether reading paused a live recognizer (so stopping reading must resume it). */
			const readingPausedRef = (0, react.useRef)(false);
			/** Reply segments queued for sequential reading. */
			const ttsQueueRef = (0, react.useRef)([]);
			/** Whether a segment is currently being read (serializes the queue). */
			const ttsSpeakingRef = (0, react.useRef)(false);
			/** The streamed text already handed to TTS; trailing incomplete sentences are intentionally excluded. */
			const ttsSpokenPrefixRef = (0, react.useRef)("");
			/** Whether the reply has finalized (so a drained queue means reading is done). */
			const ttsFinalizedRef = (0, react.useRef)(false);
			/** A stop-tap on the mic consumes its pointer-up (no toggle/monitoring side effects). */
			const stopTapRef = (0, react.useRef)(false);
			/** End reply reading (naturally or by user stop): clear state and resume monitoring if paused. */
			const finishReading = () => {
				setReadingReply(false);
				if (readingPausedRef.current) {
					readingPausedRef.current = false;
					if (monitoringRef.current) startRecognizer();
				}
			};
			/** Speak queued segments one at a time; once the queue drains after the reply finalizes, finish. */
			const pumpQueue = () => {
				const sp = speakerRef.current;
				if (sp === null || ttsSpeakingRef.current) return;
				const segment = ttsQueueRef.current.shift();
				if (segment === void 0) {
					if (ttsFinalizedRef.current) finishReading();
					return;
				}
				ttsSpeakingRef.current = true;
				sp.onend = () => {
					ttsSpeakingRef.current = false;
					pumpQueue();
				};
				console.info(`[dsh-voice] reading reply aloud: ${segment.slice(0, 40)}${segment.length > 40 ? "…" : ""}`);
				sp.speak(segment);
			};
			/** Queue reply segments for reading; pause recognition on the first so the reply is not echoed. */
			const enqueueReplySegments = (segments) => {
				for (const segment of segments) if (segment.trim().length > 0) ttsQueueRef.current.push(segment);
				if (ttsQueueRef.current.length === 0) return;
				if (!readingPausedRef.current) {
					const wasMonitoring = monitoringRef.current;
					if (wasMonitoring) pauseRecognizer();
					readingPausedRef.current = wasMonitoring;
				}
				setReadingReply(true);
				pumpQueue();
			};
			/** Stop the in-flight reply reading (user taps the mic while it reads). */
			const stopReading = () => {
				ttsQueueRef.current = [];
				ttsFinalizedRef.current = true;
				speakerRef.current?.stop();
				finishReading();
			};
			(0, react.useEffect)(() => {
				if (!chatArmedRef.current) return;
				const current = extractPartialText(partial);
				if (current.length === 0) return;
				const covered = commonPrefixLength(current, ttsSpokenPrefixRef.current);
				ttsSpokenPrefixRef.current = current.slice(0, covered);
				const parts = splitStreamSegments(current.slice(covered));
				if (parts.length === 0) return;
				const segments = [];
				let lastEnd = 0;
				for (const part of parts) {
					segments.push(part.segment);
					lastEnd = part.end;
				}
				ttsSpokenPrefixRef.current = current.slice(0, covered + lastEnd);
				enqueueReplySegments(segments);
			}, [partial]);
			/**
			* Arm reply reading: only the assistant reply arriving after the current
			* maximum assistant seq will be spoken (baseline from nodes strictly before
			* `afterSeq`, so a same-batch reply is not skipped).
			*/
			const armReplyReading = (afterSeq) => {
				replySeqRef.current = chatNodesRef.current.reduce((max, node) => node.kind === "assistant" && node.seq < afterSeq ? Math.max(max, node.seq) : max, -1);
				chatArmedRef.current = true;
			};
			(0, react.useEffect)(() => {
				if (draft === lastDraftRef.current) return;
				if (!setByUsRef.current) {
					baseRef.current = draft;
					accRef.current.reset();
					if (monitoringRef.current) restartRecognizer();
				}
				lastDraftRef.current = draft;
				setByUsRef.current = false;
			}, [draft]);
			(0, react.useEffect)(() => {
				for (let i = chatNodes.length - 1; i >= 0; i--) {
					const node = chatNodes[i];
					if (node.kind === "user" && node.seq > lastUserSeqRef.current) {
						lastUserSeqRef.current = node.seq;
						if (Date.now() - micUsedAtRef.current < 300 * 1e3) armReplyReading(node.seq);
						break;
					}
				}
			}, [chatNodes]);
			(0, react.useEffect)(() => {
				if (!chatArmedRef.current) return;
				for (let i = chatNodes.length - 1; i >= 0; i--) {
					const node = chatNodes[i];
					if (node.kind === "assistant" && node.seq > replySeqRef.current) {
						ttsFinalizedRef.current = true;
						replySeqRef.current = node.seq;
						chatArmedRef.current = false;
						const fullText = extractPartialText(node);
						const remaining = fullText.slice(commonPrefixLength(fullText, ttsSpokenPrefixRef.current));
						if (remaining.trim().length > 0) enqueueReplySegments([remaining]);
						else if (ttsQueueRef.current.length === 0 && !ttsSpeakingRef.current) finishReading();
						break;
					}
				}
			}, [chatNodes]);
			/**
			* Start one recognition segment (continuous false — the reliable mode that
			* actually delivers interim results). On segment end, auto-restart while
			* monitoring stays on, so listening is continuous across silences.
			*/
			const startRecognizer = () => {
				const rec = createBrowserRecognition();
				if (rec === null) {
					setMicState("unsupported");
					return;
				}
				const acc = accRef.current;
				rec.lang = language;
				rec.continuous = false;
				rec.interimResults = interimResults;
				rec.onresult = (event) => {
					applyResults(acc, event);
					setByUsRef.current = true;
					inputActions.setDraft([baseRef.current, acc.transcript].filter((part) => part.length > 0).join(" "));
				};
				rec.onend = () => {
					recRef.current = null;
					if (monitoringRef.current) startRecognizer();
					else setMicState("idle");
				};
				rec.onerror = (event) => {
					if (event.error === "not-allowed" || event.error === "service-not-allowed") setMicState("unsupported");
					else if (monitoringRef.current) startRecognizer();
				};
				rec.start();
				recRef.current = rec;
				setMicState("listening");
			};
			/** Enter monitoring: fresh transcript base, then keep the recognizer running. */
			const beginMonitoring = () => {
				monitoringRef.current = true;
				accRef.current = new TranscriptAccumulator();
				baseRef.current = draft;
				lastDraftRef.current = draft;
				startRecognizer();
			};
			const stopMonitoring = () => {
				monitoringRef.current = false;
				const rec = recRef.current;
				recRef.current = null;
				rec?.stop();
			};
			/**
			* Stop the current recognizer and start a fresh one. Suppresses the old
			* recognizer's handlers so its `onend` cannot double-start, and drops any
			* stale transcript the old session might still emit.
			*/
			const restartRecognizer = () => {
				const old = recRef.current;
				if (old !== null) {
					recRef.current = null;
					old.onend = () => {};
					old.onerror = () => {};
					old.stop();
				}
				startRecognizer();
			};
			/** Hold released → submit the transcript as a message (voice chat). */
			const submitChat = () => {
				monitoringRef.current = false;
				armReplyReading(Infinity);
				const rec = recRef.current;
				recRef.current = null;
				rec?.stop();
				const text = accRef.current.transcript;
				setMicState("idle");
				if (text.length > 0) {
					inputActions.setDraft(text);
					inputActions.submit();
				}
			};
			const onPointerDown = () => {
				if (micState === "unsupported") return;
				if (readingReply) {
					stopTapRef.current = true;
					stopReading();
					return;
				}
				stopTapRef.current = false;
				unlockReplyAudio();
				micUsedAtRef.current = Date.now();
				wasListeningRef.current = micState === "listening";
				holdingRef.current = false;
				if (!wasListeningRef.current) {
					beginMonitoring();
					holdTimerRef.current = window.setTimeout(() => {
						holdingRef.current = true;
					}, HOLD_THRESHOLD);
				}
			};
			const onPointerUp = () => {
				if (stopTapRef.current) {
					stopTapRef.current = false;
					return;
				}
				if (holdTimerRef.current !== null) {
					clearTimeout(holdTimerRef.current);
					holdTimerRef.current = null;
				}
				if (wasListeningRef.current) stopMonitoring();
				else if (holdingRef.current) {
					holdingRef.current = false;
					submitChat();
				}
			};
			const onPointerLeave = () => {
				if (holdingRef.current) {
					holdingRef.current = false;
					submitChat();
				}
			};
			const listening = micState === "listening";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "dsh-voice-control",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-voice-input",
					onPointerDown,
					onPointerUp,
					onPointerLeave,
					"aria-pressed": listening,
					"aria-label": t("mic.label"),
					"data-reading": readingReply || void 0,
					title: readingReply ? t("mic.title.reading") : listening ? t("mic.title.listening") : t("mic.title"),
					disabled: micState === "unsupported",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MicIcon, {
						listening,
						readingReply
					})
				})
			});
		}
		/** A linear mic icon; DeepSeek blue while listening/reading, theme primary otherwise. */
		function MicIcon({ listening, readingReply }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "dsh-voice-icon",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `@keyframes dsh-mic-pulse{0%,100%{opacity:1}50%{opacity:.45}}.dsh-voice-input{border:none;background:transparent;padding:4px;cursor:pointer;display:inline-flex;align-items:center;line-height:0;color:inherit;border-radius:6px}.dsh-voice-input:hover{background:var(--dsw-alias-interactive-bg-hover);opacity:1}.dsh-voice-icon{display:inline-flex;width:17px;height:17px;color:${listening || readingReply ? DEEPSEEK_BLUE : "var(--dsw-alias-label-secondary)"}}.dsh-voice-icon svg{width:100%;height:100%}.dsh-voice-input[aria-pressed="true"] .dsh-voice-icon{animation:dsh-mic-pulse 1s ease-in-out infinite}.dsh-voice-input[data-reading] .dsh-voice-icon{animation:dsh-mic-pulse 1s ease-in-out infinite}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
							x1: "12",
							y1: "19",
							x2: "12",
							y2: "23"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
							x1: "8",
							y1: "23",
							x2: "16",
							y2: "23"
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `voice` namespace dictionaries for the mic control.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"mic.label": "语音输入",
			"mic.title": "语音输入（点击说话，说完自动停止；按住说话，松开发送）",
			"mic.title.listening": "正在聆听…（说完自动停止）",
			"mic.title.reading": "正在朗读回复…（点击麦克风停止）",
			"mic.chat.title": "语音对话（按住说话，松开发送；回复自动朗读）",
			"mic.unsupported": "当前浏览器不支持语音输入"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"mic.label": "Voice input",
			"mic.title": "Voice input (click to speak; hold to talk, release to send)",
			"mic.title.listening": "Listening… (auto-stops on silence)",
			"mic.title.reading": "Reading the reply aloud… (tap the mic to stop)",
			"mic.chat.title": "Voice chat (hold to talk, release to send; reply read aloud)",
			"mic.unsupported": "Voice input is not supported in this browser"
		};
		//#endregion
		//#region src/client/index.ts
		const NS = "voice";
		/** Apply config defaults (client plugins resolve their own Config). */
		function resolveMicConfig(config = {}) {
			return {
				language: config.language ?? "zh-CN",
				interimResults: config.interimResults ?? true
			};
		}
		const inject = ["slots", "locale"];
		/**
		* Register the mic control into the composer tool row.
		* @param ctx - the client context.
		* @param config - optional deployment configuration.
		*/
		function apply(ctx, config = {}) {
			const resolved = resolveMicConfig(config);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-voice-input: dictionaries");
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "voice-input",
				order: 100,
				locale: NS,
				inject: (_sessionId) => resolved
			}, MicButton));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.resolveMicConfig = resolveMicConfig;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map