'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type { GameModule } from './registry';
import { Avatar3D } from '@/components/Avatar3D';
import { awardScores, dispatchLive, getSessionUid, subscribeLive, subscribeRoom } from '@/lib/room-store';
import type { Action, LiveState, RoomMeta } from '@/lib/types';
import { flashBuzzer } from '@/lib/anime';
import { Confetti, GameHeader, ReturnToLounge } from '@/components/GameChrome';

const QUESTIONS = [
  { q: 'Which planet is known as the Red Planet?', choices: ['Venus', 'Mars', 'Jupiter', 'Mercury'], a: 1 },
  { q: 'How many players start a Tag Arena round as “it”?', choices: ['1', '2', '3', 'All'], a: 0 },
  { q: 'What does the “3D” in 3D lobby stand for?', choices: ['Three Dimensions', 'Third Door', 'Triple Dice', 'Three Dragons'], a: 0 },
  { q: 'Which shape has 6 square faces?', choices: ['Pyramid', 'Cone', 'Cube', 'Torus'], a: 2 },
  { q: 'A group of wolves is called a…', choices: ['Pack', 'Flock', 'School', 'Committee'], a: 0 },
  { q: 'How many seconds in 2 minutes?', choices: ['100', '110', '120', '200'], a: 2 },
  { q: 'Which color is NOT a Roomcade neon accent?', choices: ['Orange', 'Pink', 'Beige', 'Violet'], a: 2 },
  { q: 'What do you type to join a friend’s room?', choices: ['Room code', 'Password hash', 'IP address', 'Haiku'], a: 0 },
  { q: 'In Sculptionary, who sees the secret word?', choices: ['Everyone', 'The sculptor', 'Nobody', 'The host only'], a: 1 },
  { q: 'Best strategy for Tag Arena?', choices: ['Stand still', 'Keep moving', 'Close eyes', 'Log out'], a: 1 },
  { q: 'What is the chemical symbol for gold?', choices: ['Go', 'Gd', 'Au', 'Ag'], a: 2 },
  { q: 'What is the largest organ of the human body?', choices: ['Liver', 'Skin', 'Brain', 'Lungs'], a: 1 },
  { q: 'How many bones are in the adult human body?', choices: ['186', '206', '226', '246'], a: 1 },
  { q: 'What gas do plants absorb during photosynthesis?', choices: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], a: 1 },
  { q: 'What is the powerhouse of the cell?', choices: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi body'], a: 2 },
  { q: 'What is the most abundant gas in Earth\'s atmosphere?', choices: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Argon'], a: 1 },
  { q: 'What is the speed of light in a vacuum (approx.)?', choices: ['300,000 km/s', '30,000 km/s', '3,000 km/s', '3 million km/s'], a: 0 },
  { q: 'Which element has the atomic number 1?', choices: ['Helium', 'Oxygen', 'Hydrogen', 'Carbon'], a: 2 },
  { q: 'What is the hardest natural substance on Earth?', choices: ['Quartz', 'Diamond', 'Steel', 'Granite'], a: 1 },
  { q: 'Which blood type is the universal donor?', choices: ['A+', 'B-', 'AB+', 'O-'], a: 3 },
  { q: 'How many hearts does an octopus have?', choices: ['1', '2', '3', '8'], a: 2 },
  { q: 'What is the tallest species of animal?', choices: ['Elephant', 'Giraffe', 'Moose', 'Ostrich'], a: 1 },
  { q: 'What is the only mammal capable of true flight?', choices: ['Flying squirrel', 'Bat', 'Sugar glider', 'Colugo'], a: 1 },
  { q: 'Which country has the most natural lakes?', choices: ['Russia', 'Canada', 'Finland', 'Brazil'], a: 1 },
  { q: 'What is the largest desert in the world?', choices: ['Sahara', 'Gobi', 'Antarctic Desert', 'Mojave'], a: 2 },
  { q: 'What is the longest river in the world?', choices: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'], a: 1 },
  { q: 'Which country has the most time zones?', choices: ['Russia', 'USA', 'France', 'China'], a: 2 },
  { q: 'What is the smallest country in the world by area?', choices: ['Monaco', 'Vatican City', 'San Marino', 'Nauru'], a: 1 },
  { q: 'Mount Everest sits on the border of Nepal and which country?', choices: ['India', 'Bhutan', 'China', 'Pakistan'], a: 2 },
  { q: 'Which continent has the most countries?', choices: ['Asia', 'Africa', 'Europe', 'South America'], a: 1 },
  { q: 'What is the capital of Australia?', choices: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], a: 2 },
  { q: 'In what year did World War II end?', choices: ['1943', '1944', '1945', '1946'], a: 2 },
  { q: 'Who was the first President of the United States?', choices: ['Thomas Jefferson', 'George Washington', 'John Adams', 'Abraham Lincoln'], a: 1 },
  { q: 'The Berlin Wall fell in which year?', choices: ['1987', '1989', '1991', '1993'], a: 1 },
  { q: 'Which ancient civilization built Machu Picchu?', choices: ['Aztec', 'Maya', 'Inca', 'Olmec'], a: 2 },
  { q: 'Who painted the Mona Lisa?', choices: ['Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Donatello'], a: 2 },
  { q: 'Which empire was ruled by Julius Caesar?', choices: ['Greek', 'Roman', 'Ottoman', 'Persian'], a: 1 },
  { q: 'The Titanic sank in which year?', choices: ['1905', '1912', '1918', '1923'], a: 1 },
  { q: 'Who wrote the Declaration of Independence primarily?', choices: ['Benjamin Franklin', 'Thomas Jefferson', 'John Hancock', 'James Madison'], a: 1 },
  { q: 'Which country gifted the Statue of Liberty to the USA?', choices: ['Britain', 'France', 'Spain', 'Netherlands'], a: 1 },
  { q: 'What does "WWW" stand for?', choices: ['World Wide Web', 'Wide World Web', 'Web World Wide', 'World Web Wide'], a: 0 },
  { q: 'Who co-founded Apple with Steve Jobs and Ronald Wayne?', choices: ['Bill Gates', 'Steve Wozniak', 'Paul Allen', 'Jack Dorsey'], a: 1 },
  { q: 'What year was the first iPhone released?', choices: ['2005', '2006', '2007', '2008'], a: 2 },
  { q: 'What does "CPU" stand for?', choices: ['Central Process Unit', 'Central Processing Unit', 'Computer Personal Unit', 'Core Processing Utility'], a: 1 },
  { q: 'Which company created the Android operating system before Google acquired it?', choices: ['Samsung', 'Nokia', 'Android Inc.', 'HTC'], a: 2 },
  { q: 'What is the binary representation of the decimal number 5?', choices: ['100', '101', '110', '111'], a: 1 },
  { q: 'Who is considered the first computer programmer?', choices: ['Charles Babbage', 'Ada Lovelace', 'Alan Turing', 'Grace Hopper'], a: 1 },
  { q: 'How many bytes are in a kilobyte (binary)?', choices: ['1000', '1024', '512', '2048'], a: 1 },
  { q: 'Which protocol secures web traffic with encryption?', choices: ['HTTP', 'HTTPS', 'FTP', 'SMTP'], a: 1 },
  { q: 'What does "AI" stand for?', choices: ['Automated Input', 'Artificial Intelligence', 'Advanced Interface', 'Applied Integration'], a: 1 },
  { q: 'Which sport is played at Wimbledon?', choices: ['Golf', 'Tennis', 'Cricket', 'Badminton'], a: 1 },
  { q: 'How many players are on a soccer team on the field?', choices: ['9', '10', '11', '12'], a: 2 },
  { q: 'Which country won the 2022 FIFA World Cup?', choices: ['France', 'Brazil', 'Argentina', 'Germany'], a: 2 },
  { q: 'In basketball, how many points is a free throw worth?', choices: ['1', '2', '3', '4'], a: 0 },
  { q: 'How often are the Summer Olympics held?', choices: ['Every 2 years', 'Every 3 years', 'Every 4 years', 'Every 5 years'], a: 2 },
  { q: 'Which NBA player is known as "King James"?', choices: ['Michael Jordan', 'LeBron James', 'Kobe Bryant', 'Stephen Curry'], a: 1 },
  { q: 'In cricket, how many players are on a team?', choices: ['9', '10', '11', '12'], a: 2 },
  { q: 'Which sport uses a shuttlecock?', choices: ['Squash', 'Badminton', 'Tennis', 'Racquetball'], a: 1 },
  { q: 'How many rings are on the Olympic flag?', choices: ['4', '5', '6', '7'], a: 1 },
  { q: 'Which instrument has 88 keys?', choices: ['Organ', 'Piano', 'Accordion', 'Harpsichord'], a: 1 },
  { q: 'Who is known as the "Queen of Pop"?', choices: ['Whitney Houston', 'Madonna', 'Cher', 'Beyoncé'], a: 1 },
  { q: 'Which band released the album "Abbey Road"?', choices: ['The Rolling Stones', 'The Beatles', 'Pink Floyd', 'Led Zeppelin'], a: 1 },
  { q: 'How many strings does a standard guitar have?', choices: ['4', '5', '6', '7'], a: 2 },
  { q: 'Who composed "The Four Seasons"?', choices: ['Bach', 'Mozart', 'Vivaldi', 'Beethoven'], a: 2 },
  { q: 'Which artist released the album "1989"?', choices: ['Adele', 'Taylor Swift', 'Katy Perry', 'Lady Gaga'], a: 1 },
  { q: 'What is the best-selling music album of all time?', choices: ['Thriller', 'The Dark Side of the Moon', 'Back in Black', 'The Bodyguard'], a: 0 },
  { q: 'Which country does the K-pop group BTS come from?', choices: ['Japan', 'China', 'South Korea', 'Thailand'], a: 2 },
  { q: 'Who wrote "Romeo and Juliet"?', choices: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], a: 1 },
  { q: 'Who wrote the Harry Potter series?', choices: ['J.R.R. Tolkien', 'J.K. Rowling', 'Roald Dahl', 'C.S. Lewis'], a: 1 },
  { q: 'What is the longest word in common English dictionaries?', choices: ['Antidisestablishmentarianism', 'Pneumonoultramicroscopicsilicovolcanoconiosis', 'Supercalifragilisticexpialidocious', 'Floccinaucinihilipilification'], a: 1 },
  { q: 'Who wrote "1984" and "Animal Farm"?', choices: ['Aldous Huxley', 'George Orwell', 'Ray Bradbury', 'H.G. Wells'], a: 1 },
  { q: 'How many lines are in a standard sonnet?', choices: ['10', '12', '14', '16'], a: 2 },
  { q: 'Which language has the most native speakers?', choices: ['English', 'Hindi', 'Mandarin Chinese', 'Spanish'], a: 2 },
  { q: 'What is the plural of "cactus"?', choices: ['Cactuses', 'Cacti', 'Cactus', 'Cactis'], a: 1 },
  { q: 'Which novel opens with "Call me Ishmael"?', choices: ['Moby-Dick', 'Treasure Island', 'The Old Man and the Sea', 'Robinson Crusoe'], a: 0 },
  { q: 'Which country produces the most coffee?', choices: ['Colombia', 'Brazil', 'Vietnam', 'Ethiopia'], a: 1 },
  { q: 'What spice is the most expensive by weight?', choices: ['Vanilla', 'Saffron', 'Cardamom', 'Cinnamon'], a: 1 },
  { q: 'Sushi originated in which country?', choices: ['China', 'Japan', 'Korea', 'Thailand'], a: 1 },
  { q: 'What is the main ingredient in guacamole?', choices: ['Tomato', 'Avocado', 'Cucumber', 'Pea'], a: 1 },
  { q: 'Which fruit is known as the "king of fruits" in Southeast Asia?', choices: ['Mango', 'Durian', 'Papaya', 'Lychee'], a: 1 },
  { q: 'How many teaspoons are in a tablespoon?', choices: ['2', '3', '4', '5'], a: 1 },
  { q: 'Which cheese is traditionally used on a Margherita pizza?', choices: ['Cheddar', 'Mozzarella', 'Parmesan', 'Gouda'], a: 1 },
  { q: 'What is the hottest chili pepper commonly ranked (as of 2023)?', choices: ['Ghost Pepper', 'Carolina Reaper', 'Habanero', 'Scotch Bonnet'], a: 1 },
  { q: 'Which grain is used to make traditional Japanese sake?', choices: ['Wheat', 'Rice', 'Barley', 'Corn'], a: 1 },
  { q: 'What does the "Doge" meme feature?', choices: ['A cat', 'A Shiba Inu dog', 'A frog', 'A bird'], a: 1 },
  { q: 'Which video-sharing app popularized short vertical videos in the 2010s?', choices: ['Vine', 'TikTok', 'Snapchat', 'Periscope'], a: 1 },
  { q: 'What year did Vine shut down?', choices: ['2015', '2016', '2017', '2018'], a: 1 },
  { q: 'Which fictional character says "I am Groot"?', choices: ['Rocket', 'Groot', 'Star-Lord', 'Drax'], a: 1 },
  { q: 'What is the name of the coffee chain with a green siren logo?', choices: ['Dunkin\'', 'Starbucks', 'Costa', 'Peet\'s'], a: 1 },
  { q: 'Which planet has the most moons?', choices: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], a: 1 },
  { q: 'What is the closest star to Earth?', choices: ['Sirius', 'Proxima Centauri', 'The Sun', 'Alpha Centauri A'], a: 2 },
  { q: 'How long does light from the Sun take to reach Earth?', choices: ['8 seconds', '8 minutes', '8 hours', '8 days'], a: 1 },
  { q: 'Which planet spins on its side?', choices: ['Venus', 'Uranus', 'Neptune', 'Mars'], a: 1 },
  { q: 'What is a group of stars forming a pattern called?', choices: ['Galaxy', 'Constellation', 'Nebula', 'Cluster'], a: 1 },
  { q: 'Which was the first artificial satellite launched into space?', choices: ['Explorer 1', 'Sputnik 1', 'Vostok 1', 'Apollo 1'], a: 1 },
  { q: 'Who was the first person to walk on the Moon?', choices: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'Michael Collins'], a: 2 },
  { q: 'What is the largest planet in our solar system?', choices: ['Saturn', 'Jupiter', 'Neptune', 'Earth'], a: 1 },
  { q: 'Which video game features the character Mario?', choices: ['Sonic', 'Super Mario Bros.', 'Zelda', 'Metroid'], a: 1 },
  { q: 'What is the best-selling video game of all time?', choices: ['Tetris', 'Minecraft', 'Grand Theft Auto V', 'Wii Sports'], a: 1 },
  { q: 'Which company created the PlayStation?', choices: ['Nintendo', 'Sega', 'Sony', 'Microsoft'], a: 2 },
  { q: 'In Minecraft, what do you mine to craft a diamond pickaxe?', choices: ['Diamonds and sticks', 'Gold and wood', 'Iron and stone', 'Emeralds and sticks'], a: 0 },
  { q: 'Which game series features Master Chief?', choices: ['Halo', 'Gears of War', 'Call of Duty', 'Destiny'], a: 0 },
  { q: 'What is the highest possible score in a single frame of bowling?', choices: ['10', '20', '30', '40'], a: 2 },
  { q: 'Which planet is known as Earth\'s twin due to similar size?', choices: ['Mars', 'Venus', 'Mercury', 'Neptune'], a: 1 },
];

interface TState extends LiveState {
  phase: 'waiting' | 'question' | 'buzzed' | 'reveal' | 'done';
  qIndex: number; qOrder: number[]; buzzedUid: string | null; buzzOrder: string[];
  correctUid: string | null; picked: number | null;
}
function init(): TState {
  return { phase: 'waiting', qIndex: 0, qOrder: [], buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
}
function shuffledOrder(total: number): number[] {
  const arr = Array.from({ length: total }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
// Resolve the actual question index for the current position, using the host's
// shuffled order when present.
function questionAt(s: TState): number {
  const order = s.qOrder && s.qOrder.length ? s.qOrder : null;
  return order ? (order[s.qIndex] ?? s.qIndex) : s.qIndex;
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as TState;
  switch (action.type) {
    case 'ask':
      return { ...s, phase: 'question', qIndex: action.payload?.qIndex ?? 0, qOrder: Array.isArray(action.payload?.qOrder) && action.payload.qOrder.length ? action.payload.qOrder : shuffledOrder(QUESTIONS.length), buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
    case 'buzz':
      if (s.phase !== 'question' || (s.buzzOrder || []).includes(action.uid)) return s;
      return { ...s, phase: 'buzzed', buzzedUid: action.uid, buzzOrder: [...(s.buzzOrder || []), action.uid] };
    case 'answer': {
      const correct = action.payload.choice === QUESTIONS[questionAt(s)]!.a;
      if (correct) return { ...s, phase: 'reveal', correctUid: action.uid, picked: action.payload.choice };
      // wrong: back to question, buzzed player locked out this round
      return { ...s, phase: 'question', buzzedUid: null, picked: action.payload.choice };
    }
    case 'next': {
      const qIndex = s.qIndex + 1;
      if (qIndex >= QUESTIONS.length) return { ...s, phase: 'done' };
      return { ...s, phase: 'question', qIndex, buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
    }
    case 'end':
      return { ...s, phase: 'done' };
    default:
      return s;
  }
}

function Podiums({ players, buzzedUid, correctUid }: { players: RoomMeta['players']; buzzedUid: string | null; correctUid: string | null }) {
  const spot = useRef<any>(null);
  useFrame(({ clock }) => {
    if (spot.current) spot.current.intensity = buzzedUid ? 30 + Math.sin(clock.getElapsedTime() * 8) * 10 : 12;
  });
  return (
    <group>
      {players.map((p, i) => {
        const x = (i - (players.length - 1) / 2) * 2.2;
        const hot = p.uid === (correctUid ?? buzzedUid);
        return (
          <group key={p.uid} position={[x, 0, 0]}>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.55, 0.7, 0.8, 20]} />
              <meshStandardMaterial color={correctUid === p.uid ? '#34D399' : hot ? '#FF3D81' : '#2a2a5e'}
                emissive={hot || correctUid === p.uid ? (correctUid === p.uid ? '#34D399' : '#FF3D81') : '#000'} emissiveIntensity={hot ? 1 : 0.15} />
            </mesh>
            <Avatar3D color={p.avatarColor} name={p.name} position={[0, 0.8, 0]} highlight={hot} />
            {hot && <pointLight position={[x, 4, 2]} intensity={30} distance={10} color={correctUid ? '#34D399' : '#FF3D81'} />}
          </group>
        );
      })}
      <pointLight ref={spot} position={[0, 6, 4]} intensity={12} distance={20} color="#fff6e9" />
    </group>
  );
}

function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []);
  const [live, setL] = useState<TState | null>(null);
  const [room, setRoom] = useState<RoomMeta | null>(null);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as TState) ?? null)), [roomCode]);
  useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  const isHost = room?.hostId === uid;
  const qIdx = live ? questionAt(live) : 0;
  const q = live ? QUESTIONS[qIdx] : null;
  const myTurn = live?.buzzedUid === uid;
  const lockedOut = !!live && live.phase === 'question' && (live.buzzOrder || []).includes(uid) && (live.buzzOrder || [])[0] !== uid;

  const act = (type: string, payload: any = {}) =>
    dispatchLive(roomCode, { type, uid, payload }, applyAction, init);
  const startQuiz = () => act('ask', { qIndex: 0, qOrder: shuffledOrder(QUESTIONS.length) });

  const buzz = () => {
    act('buzz');
    flashBuzzer('#buzz-btn', '#FF3D81');
  };
  const answer = (choice: number) => {
    const correct = choice === QUESTIONS[qIdx]!.a;
    if (correct) {
      awardScores(roomCode, { [uid]: 100 });
      flashBuzzer('#quiz-card', '#34D399');
    }
    act('answer', { choice });
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <GameHeader name="Trivia Podiums" accent="#FFC53D" phase={live?.phase} round={`Q${(live?.qIndex ?? 0) + 1}/${QUESTIONS.length}`} playerCount={room?.players.length} />
      <div className="flex h-full flex-col gap-2 lg:flex-row">
      <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl border border-white/10">
        <Canvas camera={{ position: [0, 4.5, 9], fov: 50 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#101028']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[4, 7, 3]} intensity={0.9} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
            <planeGeometry args={[30, 30]} />
            <meshStandardMaterial color="#141432" roughness={0.9} />
          </mesh>
          {room && <Podiums players={room.players} buzzedUid={live?.buzzedUid ?? null} correctUid={live?.correctUid ?? null} />}
        </Canvas>
      </div>
      <div className="flex w-full flex-col gap-2 lg:w-96">
        {(!live || live.phase === 'waiting') && (
          <div className="arcade-card p-4">
            <div className="font-display text-lg font-extrabold">Trivia Podiums 🎙️</div>
            <p className="text-sm text-white/70">Host reveals a question — fastest buzzer gets the spotlight and answers. Correct = +100 & green flash.</p>
            {isHost
              ? <button onClick={startQuiz} className="btn-neon mt-2 w-full rounded-xl px-3 py-2 text-sm font-bold">Ask question 1</button>
              : <p className="mt-2 text-sm text-white/60">Waiting for host…</p>}
          </div>
        )}
        {live && (live.phase === 'question' || live.phase === 'buzzed') && q && (
          <div id="quiz-card" className="arcade-card p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-white/50">Question {live.qIndex + 1}/{QUESTIONS.length}</div>
            <div className="font-display mt-1 text-xl font-extrabold">{q.q}</div>
            {live.phase === 'question' && !lockedOut && (
              <button id="buzz-btn" onClick={buzz} className="btn-neon mt-3 w-full rounded-xl px-3 py-3 font-display text-xl font-extrabold">🔔 BUZZ IN</button>
            )}
            {lockedOut && <p className="mt-2 text-sm text-white/60">You buzzed wrong — locked out for this question.</p>}
            {live.phase === 'buzzed' && (
              <p className="mt-2 text-sm font-bold text-[#FF3D81]">
                {myTurn ? '🎯 You have the spotlight — pick an answer!' : `${room?.players.find((p) => p.uid === live.buzzedUid)?.name} is answering…`}
              </p>
            )}
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {q.choices.map((c, i) => (
                <button key={i} disabled={!myTurn} onClick={() => answer(i)}
                  className={`rounded-xl px-3 py-2 text-left text-sm font-semibold ${myTurn ? 'bg-white/10 hover:bg-[#FF3D81]/40' : 'bg-white/5 text-white/60'}`}>
                  {String.fromCharCode(65 + i)}. {c}
                </button>
              ))}
            </div>
            {isHost && <button onClick={() => act('next')} className="mt-2 w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Skip / next →</button>}
          </div>
        )}
        {live?.phase === 'reveal' && q && (
          <div className="arcade-card border-[#34D399]/50 p-4 text-center">
            <div className="font-display text-xl font-extrabold text-[#34D399]">✅ {room?.players.find((p) => p.uid === live.correctUid)?.name} scores +100!</div>
            <p className="text-sm text-white/70">Answer: {q.choices[q.a]}</p>
            {isHost && (
              <div className="mt-2 flex gap-1">
                <button onClick={() => act('next')} className="btn-neon flex-1 rounded-xl px-3 py-2 text-sm font-bold">Next question</button>
                <button onClick={() => act('end')} className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Finish</button>
              </div>
            )}
          </div>
        )}
        {live?.phase === 'done' && (
          <div className="arcade-card phase-fade relative p-4 text-center">
            <Confetti />
            <div className="font-display text-xl font-extrabold">That’s the quiz! 🎉</div>
            {isHost && <ReturnToLounge roomCode={roomCode} className="mt-2" />}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function Preview() {
  const ref = useRef<any>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = 0.2 + Math.sin(clock.getElapsedTime() * 2) * 0.15;
  });
  return (
    <group>
      <mesh position={[0, -0.4, 0]}><cylinderGeometry args={[0.4, 0.5, 0.5, 16]} /><meshStandardMaterial color="#FFC53D" emissive="#FFC53D" emissiveIntensity={0.5} /></mesh>
      <mesh ref={ref}><sphereGeometry args={[0.25, 14, 14]} /><meshStandardMaterial color="#FF3D81" emissive="#FF3D81" emissiveIntensity={0.9} /></mesh>
    </group>
  );
}

export const Trivia: GameModule = {
  id: 'trivia', displayName: 'Trivia Podiums', tagline: 'Buzz fast, shine bright',
  minPlayers: 2, maxPlayers: 8, accent: '#FFC53D',
  LobbyPreviewScene: Preview, GameScene, applyAction, initState: init,
};
