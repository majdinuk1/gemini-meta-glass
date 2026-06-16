import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { Mic, MicOff, Camera, RefreshCw, Send, Settings, Bot, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types for Speech Recognition (Web Speech API)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const API_KEY_KEY = 'GEMINI_API_KEY';
const DEFAULT_API_KEY = 'AIzaSyCcKAT53P6Tqb_Il6KqUv0WgE-5-uLjIro';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(localStorage.getItem(API_KEY_KEY) || DEFAULT_API_KEY);
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize Gemini
  const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    localStorage.setItem('GEMINI_CHAT_HISTORY', JSON.stringify(messages));
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const current = event.results[event.results.length - 1][0].transcript;
        setTranscript(current);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!useVoice || !synthRef.current) return;
    
    // Cancel any current speaking
    synthRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => {};
    utterance.onend = () => {
      // Auto-listen after speaking if desired? 
      // Maybe not automatically to avoid loops, but user can trigger.
    };
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
        // Simple chat history
        const history = messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })) as Content[];
        
        const chat = model.startChat({ history });
        result = await chat.sendMessage(text);
      }

      const responseText = result.response.text();
      setMessages(prev => [...prev, { role: 'bot', text: responseText }]);
      speak(responseText);
    } catch (error) {
      console.error('Gemini error:', error);
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I encountered an error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const imageData = canvasRef.current.toDataURL('image/jpeg');
        setShowCamera(false);
        // Ask Gemini about the image
        handleSendMessage("Tell me what you see here.", imageData);
        
        // Stop camera streams
        const stream = videoRef.current.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
      }
    }
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setShowCamera(false);
    }
  };

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(API_KEY_KEY, key);
    setShowSettings(false);
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden safe-area-inset">
      {/* Header */}
      <header className="p-4 border-b border-white/10 flex justify-between items-center bg-black/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
          <h1 className="text-lg font-bold tracking-tight">GEMINI GLASS</h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setIsTranslateMode(!isTranslateMode)} 
            className={cn(
              "px-3 py-1 rounded-full text-xs font-bold transition-colors",
              isTranslateMode ? "bg-blue-600 text-white" : "bg-white/10 text-white/50"
            )}
          >
            {isTranslateMode ? `TO ${targetLang.toUpperCase()}` : "CHAT"}
          </button>
          <button onClick={() => setUseVoice(!useVoice)} className="opacity-70 hover:opacity-100 transition-opacity">
            {useVoice ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button onClick={() => setShowSettings(true)} className="opacity-70 hover:opacity-100 transition-opacity">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Bot size={64} className="text-blue-500" />
            <p className="text-xl font-medium">How can I help you today?</p>
            <p className="text-sm">Try saying "What's in front of me?"</p>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex flex-col max-w-[85%]",
                msg.role === 'user' ? "ml-auto items-end" : "items-start"
              )}
            >
              {msg.image && (
                <img src={msg.image} alt="Captured" className="w-48 rounded-lg mb-2 border border-white/20" />
              )}
              <div className={cn(
                "px-4 py-2 rounded-2xl text-lg",
                msg.role === 'user' ? "bg-blue-600 rounded-tr-none" : "bg-white/10 rounded-tl-none"
              )}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 items-center text-blue-400">
            <RefreshCw size={16} className="animate-spin" />
            <span className="text-sm font-medium">Gemini is thinking...</span>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* Bottom Controls */}
      <footer className="p-6 bg-gradient-to-t from-black via-black to-transparent space-y-4">
        {transcript && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-blue-300 italic text-lg px-4"
          >
            "{transcript}"
          </motion.div>
        )}

        <div className="flex justify-center items-center gap-8">
          <button 
            onClick={startCamera}
            className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Camera size={28} />
          </button>

          <button 
            onClick={toggleListening}
            className={cn(
              "p-8 rounded-full transition-all duration-300 scale-110 shadow-2xl shadow-blue-500/20",
              isListening ? "bg-red-500 scale-125 animate-pulse" : "bg-blue-600 hover:bg-blue-500"
            )}
          >
            {isListening ? <MicOff size={40} /> : <Mic size={40} />}
          </button>

          <button 
            onClick={() => {
              const text = prompt("Type your message:");
              if (text) handleSendMessage(text);
            }}
            className="p-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Send size={28} />
          </button>
        </div>
      </footer>

      {/* Camera Overlay */}
      <AnimatePresence>
        {showCamera && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
          >
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none" />
            <div className="absolute bottom-12 flex gap-8">
              <button 
                onClick={() => {
                  setShowCamera(false);
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(track => track.stop());
                }}
                className="px-6 py-3 bg-white/10 rounded-full font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={captureImage}
                className="w-20 h-20 bg-white rounded-full border-4 border-white shadow-xl"
              />
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings / API Key Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="w-full max-w-md bg-white/5 p-8 rounded-3xl border border-white/10 space-y-6">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Settings className="text-blue-500" /> Settings
              </h2>
              <div className="space-y-2">
                <label className="text-sm font-medium opacity-70">Gemini API Key</label>
                <input 
                  type="password"
                  placeholder="Paste your API key here..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                  defaultValue={apiKey}
                  onBlur={(e) => saveApiKey(e.target.value)}
                />
                <p className="text-xs opacity-40">Your key is stored locally on this device.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium opacity-70">Translation Target</label>
                <select 
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-blue-500 transition-colors"
                >
                  {['Spanish', 'French', 'German', 'Arabic', 'Japanese', 'Chinese', 'Hindi'].map(lang => (
                    <option key={lang} value={lang} className="bg-black">{lang}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={() => setMessages([])}
                className="w-full py-3 bg-red-600/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-600/30 transition-colors"
              >
                Clear History
              </button>
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full py-4 bg-blue-600 rounded-xl font-bold hover:bg-blue-500 transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
