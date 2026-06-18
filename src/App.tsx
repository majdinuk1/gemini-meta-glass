import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { Mic, MicOff, Camera, RefreshCw, Send, Settings, User, Bot, Volume2, VolumeX, Car, MessageCircle, Video, Users, ArrowLeft, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- GEMINI CHAT COMPONENT ---
const API_KEY_KEY = 'GEMINI_API_KEY';
const DEFAULT_API_KEY = 'AIzaSyCcKAT53P6Tqb_Il6KqUv0WgE-5-uLjIro';

function GeminiApp({ onBack }: { onBack: () => void }) {
  const [apiKey] = useState<string>(localStorage.getItem(API_KEY_KEY) || DEFAULT_API_KEY);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'bot'; text: string; image?: string }[]>(() => {
    const saved = localStorage.getItem('GEMINI_CHAT_HISTORY');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [useVoice, setUseVoice] = useState(true);
  const [isTranslateMode, setIsTranslateMode] = useState(false);
  const [targetLang, setTargetLang] = useState('Spanish');
  const [showCamera, setShowCamera] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [hardwareCompatibility, setHardwareCompatibility] = useState({ mic: true, cam: true });

  useEffect(() => {
    const checkHardware = async () => {
      const mic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      setHardwareCompatibility({ mic, cam: mic }); // Usually both or none on these glasses
    };
    checkHardware();
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    localStorage.setItem('GEMINI_CHAT_HISTORY', JSON.stringify(messages));
  }, [messages]);

  const handleKeyboardKey = (key: string) => {
    if (key === 'BACK') {
      setInputText(prev => prev.slice(0, -1));
    } else if (key === 'SPACE') {
      setInputText(prev => prev + ' ');
    } else if (key === 'DONE') {
      if (inputText.trim()) handleSendMessage(inputText);
      setInputText('');
      setShowKeyboard(false);
    } else {
      setInputText(prev => prev + key);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case 'Enter':
          if (showKeyboard) handleKeyboardKey('DONE');
          else if (showCamera) captureImage();
          else toggleListening();
          break;
        case 'Escape':
          if (showKeyboard) setShowKeyboard(false);
          else if (showSettings) setShowSettings(false);
          else if (showCamera) stopCamera();
          else onBack();
          break;
        case 'ArrowDown':
          if (!showCamera) startCamera();
          break;
        case 'ArrowUp':
          setIsTranslateMode(prev => !prev);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCamera, showSettings, isTranslateMode, showKeyboard, inputText]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const current = event.results[event.results.length - 1][0].transcript;
        setTranscript(current);
      };

      recognition.onerror = (event: any) => {
        setStatus({ type: 'error', message: `Mic Error: ${event.error}` });
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setTranscript(current => {
          if (current.trim()) handleSendMessage(current);
          return '';
        });
      };

      recognitionRef.current = recognition;
    } else {
      setStatus({ type: 'error', message: "Speech recognition not supported." });
    }
  }, []);

  const requestPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(t => t.stop());
      setStatus({ type: 'info', message: "Permissions granted!" });
    } catch (err) {
      setStatus({ type: 'error', message: "Permission denied." });
    }
  };

  const speak = useCallback((text: string) => {
    if (!useVoice || !synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    synthRef.current.speak(utterance);
  }, [useVoice]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setTranscript('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSendMessage = async (text: string, imageData?: string) => {
    if (!text.trim() && !imageData) return;
    if (!genAI) {
      setShowSettings(true);
      return;
    }

    const userMessage = { role: 'user' as const, text, image: imageData };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setTranscript('');

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      let result;
      const promptPrefix = isTranslateMode ? `Translate the following to ${targetLang}. Only provide the translation: ` : "";

      if (imageData) {
        const base64Data = imageData.split(',')[1];
        result = await model.generateContent([
          promptPrefix + (text || "What is in this image?"),
          { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
        ]);
      } else {
        const history = messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })) as Content[];
        const chat = model.startChat({ history });
        result = await chat.sendMessage(promptPrefix + text);
      }

      const responseText = result.response.text();
      setMessages(prev => [...prev, { role: 'bot', text: responseText }]);
      speak(responseText);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I encountered an error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    setStatus({ type: 'info', message: "Opening camera..." });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 600 }, height: { ideal: 600 } } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => videoRef.current?.play();
      }
    } catch (err) {
      setStatus({ type: 'error', message: "Camera failed. Check permissions." });
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvasRef.current.toDataURL('image/jpeg');
        stopCamera();
        handleSendMessage("Tell me what you see here.", imageData);
      }
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-[600px] bg-black text-white relative">
      <header className="p-4 border-b border-white/10 flex justify-between items-center bg-black z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20"><ArrowLeft size={20} /></button>
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <h1 className="text-xl font-bold tracking-tight">GEMINI GLASS</h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsTranslateMode(!isTranslateMode)} className={cn("px-3 py-1 rounded-full text-xs font-bold", isTranslateMode ? "bg-blue-600" : "bg-white/10")}>
            {isTranslateMode ? `TO ${targetLang.toUpperCase()}` : "CHAT"}
          </button>
          <button onClick={() => setUseVoice(!useVoice)} className="opacity-70">{useVoice ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
          <button onClick={() => setShowSettings(true)} className="opacity-70"><Settings size={20} /></button>
        </div>
      </header>

      {/* Status Bar */}
      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={cn(
              "absolute top-20 left-4 right-4 p-3 rounded-xl text-sm font-bold text-center z-50",
              status.type === 'error' ? "bg-red-500/90" : "bg-green-500/90"
            )}
          >
            {status.message}
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide pb-32">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Bot size={64} className="text-blue-500" />
            <p className="text-xl font-medium">How can I help you?</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex flex-col max-w-[85%]", msg.role === 'user' ? "ml-auto items-end" : "items-start")}>
            {msg.image && <img src={msg.image} alt="Captured" className="w-48 rounded-lg mb-2 border border-white/20" />}
            <div className={cn("px-4 py-3 rounded-2xl text-lg", msg.role === 'user' ? "bg-blue-600 rounded-tr-none" : "bg-white/10 rounded-tl-none")}>
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && <div className="text-blue-400 text-sm animate-pulse">Gemini is thinking...</div>}
        <div ref={chatEndRef} />
      </main>

      <footer className="p-4 bg-gradient-to-t from-black via-black to-transparent space-y-4 absolute bottom-0 left-0 right-0">
        {transcript && <div className="text-center text-blue-300 italic text-lg px-4">"{transcript}"</div>}
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button onClick={() => setShowKeyboard(!showKeyboard)} className="flex-1 bg-white/15 border border-white/30 rounded-2xl px-4 py-3 text-left text-lg text-white/40 overflow-hidden whitespace-nowrap min-h-[52px]">
              {inputText || "Tap to type..."}
            </button>
            {inputText.trim() && (
              <button onClick={() => { handleSendMessage(inputText); setInputText(''); }} className="p-3 bg-blue-600 rounded-2xl"><Send size={24} /></button>
            )}
          </div>
          <div className="flex justify-center items-center gap-12">
            <button onClick={startCamera} className="p-4 rounded-full bg-white/5 hover:bg-white/10"><Camera size={28} /></button>
            <button onClick={toggleListening} className={cn("p-8 rounded-full shadow-2xl", isListening ? "bg-red-500 animate-pulse scale-110" : "bg-blue-600")}>
              {isListening ? <MicOff size={40} /> : <Mic size={40} />}
            </button>
            <button onClick={() => setShowKeyboard(true)} className="p-4 rounded-full bg-white/5 hover:bg-white/10"><User size={28} /></button>
          </div>
        </div>
      </footer>

      {/* On-Screen Keyboard */}
      <AnimatePresence>
        {showKeyboard && (
          <motion.div 
            initial={{ y: 300 }} 
            animate={{ y: 0 }} 
            exit={{ y: 300 }}
            className="absolute bottom-0 left-0 right-0 bg-zinc-950 p-2 grid grid-cols-10 gap-1 z-[100] border-t border-white/10 shadow-2xl"
          >
            {['Q','W','E','R','T','Y','U','I','O','P','A','S','D','F','G','H','J','K','L','-','Z','X','C','V','B','N','M',',','.','?'].map(k => (
              <button key={k} onClick={() => handleKeyboardKey(k)} className="p-3 bg-white/5 rounded text-sm active:bg-blue-600 focus:bg-blue-600 outline-none border border-white/5">
                {k}
              </button>
            ))}
            <button onClick={() => handleKeyboardKey('BACK')} className="col-span-2 p-3 bg-red-900/40 rounded text-xs font-bold border border-red-500/20">DEL</button>
            <button onClick={() => handleKeyboardKey('SPACE')} className="col-span-6 p-3 bg-white/10 rounded uppercase text-xs tracking-widest border border-white/10">Space</button>
            <button onClick={() => handleKeyboardKey('DONE')} className="col-span-2 p-3 bg-blue-600 rounded text-xs font-bold shadow-lg shadow-blue-500/20">SEND</button>
          </motion.div>
        )}
      </AnimatePresence>

      {showSettings && (
        <div className="absolute inset-0 z-50 bg-black/95 flex flex-col p-6 space-y-4 justify-start overflow-y-auto">
          <h2 className="text-2xl font-bold border-b border-white/10 pb-2">Hardware Status</h2>
          
          <div className="space-y-2 py-2">
            <div className="flex justify-between items-center text-xs">
              <span className="opacity-50">Microphone:</span>
              <span className={hardwareCompatibility.mic ? "text-green-500" : "text-red-500"}>
                {hardwareCompatibility.mic ? "SUPPORTED" : "RESTRICTED BY OS"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="opacity-50">Camera:</span>
              <span className={hardwareCompatibility.cam ? "text-green-500" : "text-red-500"}>
                {hardwareCompatibility.cam ? "SUPPORTED" : "RESTRICTED BY OS"}
              </span>
            </div>
          </div>

          {!hardwareCompatibility.mic && (
            <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-xl text-[10px] leading-relaxed">
              <p className="font-bold mb-1 underline">HOW TO ENABLE PERMISSIONS:</p>
              1. Open **Meta View App** on phone.<br/>
              2. Go to **Settings > Early Access**.<br/>
              3. Ensure **Developer Mode** is ON.<br/>
              4. Open this URL in **Chrome** on phone first and click "Allow".
            </div>
          )}

          <button onClick={requestPermissions} className="py-3 bg-white/10 rounded-xl font-bold flex items-center justify-center gap-2 text-sm"><RefreshCw size={16} /> Force Prompt</button>
          
          <div className="space-y-1">
            <label className="text-[10px] opacity-50 uppercase font-bold">Target Language</label>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full p-3 bg-white/5 rounded-xl border border-white/10 text-sm">
              {['Spanish', 'French', 'German', 'Arabic', 'Japanese', 'Chinese', 'Hindi'].map(lang => <option key={lang} value={lang} className="bg-black">{lang}</option>)}
            </select>
          </div>

          <button onClick={() => setMessages([])} className="py-3 bg-red-600/20 text-red-400 rounded-xl text-sm font-bold">Clear Chat</button>
          <button onClick={() => setShowSettings(false)} className="py-4 bg-blue-600 rounded-xl font-bold shadow-lg">Back to App</button>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// --- OBD BLUETOOTH DASHBOARD COMPONENT ---
function OBDApp({ onBack }: { onBack: () => void }) {
  const [speed, setSpeed] = useState<number>(0);
  const [rpm, setRpm] = useState<number>(0);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Disconnected");
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (!('bluetooth' in navigator)) {
      setIsSupported(false);
      setStatus("Bluetooth Not Supported by Browser");
    }
  }, []);

  const connectOBD = async () => {
    if (!isSupported) return;
    try {
      setStatus("Requesting Bluetooth...");
      const navBT = (navigator as any).bluetooth;
      if (!navBT) throw new Error("Bluetooth API not found");

      const device = await navBT.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });
      setStatus(`Connecting to ${device.name}...`);
      setTimeout(() => {
        setConnected(true);
        setStatus("Connected to ELM327");
        simulateData();
      }, 2000);
    } catch (error: any) {
      setStatus(`BT Error: ${error.message}`);
    }
  };

  const simulateData = () => {
    setInterval(() => {
      setSpeed(prev => Math.min(160, Math.max(0, prev + (Math.random() * 10 - 4))));
      setRpm(prev => Math.min(8000, Math.max(800, prev + (Math.random() * 500 - 200))));
    }, 500);
  };

  return (
    <div className="flex flex-col h-[600px] w-[600px] bg-black text-white p-6 relative">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onBack} className="p-3 bg-white/10 rounded-full hover:bg-white/20"><ArrowLeft size={24} /></button>
        <h1 className="text-3xl font-bold tracking-widest text-emerald-400">OBD DASHBOARD</h1>
      </div>
      
      {!connected ? (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <Car size={80} className="text-emerald-500 opacity-50" />
          <p className="text-xl text-white/50">{status}</p>
          <button onClick={connectOBD} className="px-8 py-4 bg-emerald-600 rounded-full text-xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-transform">
            Pair Bluetooth OBD-II
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center space-y-12">
          <div className="relative flex items-center justify-center">
            <svg className="w-64 h-64 transform -rotate-90">
              <circle cx="128" cy="128" r="120" stroke="rgba(255,255,255,0.1)" strokeWidth="16" fill="none" />
              <circle cx="128" cy="128" r="120" stroke="#10b981" strokeWidth="16" fill="none" strokeDasharray="753" strokeDashoffset={753 - (753 * (speed / 160))} className="transition-all duration-300" />
            </svg>
            <div className="absolute text-center">
              <div className="text-6xl font-black tabular-nums tracking-tighter">{Math.round(speed)}</div>
              <div className="text-xl text-emerald-400 font-bold tracking-widest uppercase">KM/H</div>
            </div>
          </div>
          <div className="w-full bg-white/5 rounded-3xl p-6 flex justify-between items-center border border-white/10">
            <div>
              <div className="text-sm text-white/50 uppercase tracking-widest">Engine RPM</div>
              <div className="text-4xl font-bold tabular-nums text-blue-400">{Math.round(rpm)}</div>
            </div>
            <Activity size={48} className="text-blue-500/50" />
          </div>
        </div>
      )}
    </div>
  );
}

// --- MAIN OS LAUNCHER ---
export default function App() {
  const [activeApp, setActiveApp] = useState<'launcher' | 'gemini' | 'obd'>('launcher');

  if (activeApp === 'gemini') return <GeminiApp onBack={() => setActiveApp('launcher')} />;
  if (activeApp === 'obd') return <OBDApp onBack={() => setActiveApp('launcher')} />;

  const launchExternal = (url: string, name: string) => {
    const confirm = window.confirm(`Launch official Web App for ${name}?`);
    if (confirm) window.location.href = url;
  };

  return (
    <div className="flex flex-col h-[600px] w-[600px] bg-black text-white p-6 relative overflow-hidden">
      <header className="flex justify-between items-center mb-8 pt-4">
        <h1 className="text-2xl font-bold tracking-widest text-white/80">META OS HUB</h1>
        <div className="text-sm font-mono text-white/50">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      </header>

      <div className="grid grid-cols-2 gap-6 flex-1 content-start">
        <button 
          onClick={() => setActiveApp('gemini')}
          className="bg-gradient-to-br from-blue-600 to-blue-900 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl active:scale-95 transition-transform"
        >
          <Bot size={48} className="text-white" />
          <span className="text-lg font-bold tracking-wide">Gemini AI</span>
        </button>

        <button 
          onClick={() => setActiveApp('obd')}
          className="bg-gradient-to-br from-emerald-600 to-emerald-900 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl active:scale-95 transition-transform"
        >
          <Car size={48} className="text-white" />
          <span className="text-lg font-bold tracking-wide">OBD Dash</span>
        </button>

        <button 
          onClick={() => launchExternal('https://web.telegram.org/a/', 'Telegram')}
          className="bg-gradient-to-br from-sky-500 to-sky-700 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl active:scale-95 transition-transform"
        >
          <MessageCircle size={48} className="text-white" />
          <span className="text-lg font-bold tracking-wide">Telegram</span>
        </button>

        <button 
          onClick={() => launchExternal('https://app.zoom.us/wc/', 'Zoom')}
          className="bg-gradient-to-br from-indigo-500 to-indigo-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl active:scale-95 transition-transform"
        >
          <Video size={48} className="text-white" />
          <span className="text-lg font-bold tracking-wide">Zoom Web</span>
        </button>

        <button 
          onClick={() => launchExternal('https://teams.live.com', 'Microsoft Teams')}
          className="bg-gradient-to-br from-violet-600 to-purple-900 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 shadow-xl active:scale-95 transition-transform col-span-2"
        >
          <Users size={48} className="text-white" />
          <span className="text-lg font-bold tracking-wide">Teams Web</span>
        </button>
      </div>
      <div className="text-center text-xs text-white/30 pb-2">v2.0 • Web PWA Hub</div>
    </div>
  );
}
