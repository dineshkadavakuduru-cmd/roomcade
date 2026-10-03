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
  { q: 'Which film features the line "I am your father"?', choices: ['Star Wars: A New Hope', 'The Empire Strikes Back', 'Return of the Jedi', 'Rogue One'], a: 1, cat: 'Plot & Story' },
  { q: 'Who directed Inception (2010)?', choices: ['Steven Spielberg', 'Ridley Scott', 'Christopher Nolan', 'James Cameron'], a: 2, cat: 'Directors & Cast' },
  { q: 'A hobbit destroys a powerful ring in a volcano. Name the film.', choices: ['The Hobbit', 'Lord of the Rings: Fellowship', 'Lord of the Rings: Return of the King', 'Excalibur'], a: 2, cat: 'Guess the Movie' },
  { q: 'Which actor played Tony Stark / Iron Man across the MCU?', choices: ['Chris Evans', 'Robert Downey Jr.', 'Chris Pratt', 'Mark Ruffalo'], a: 1, cat: 'Directors & Cast' },
  { q: 'In which film does a clownfish cross the ocean to find his son?', choices: ['Shark Tale', 'Finding Nemo', 'Finding Dory', 'The Little Mermaid'], a: 1, cat: 'Guess the Movie' },
  { q: 'Who directed Pulp Fiction (1994)?', choices: ['Martin Scorsese', 'Quentin Tarantino', 'David Fincher', 'Coen Brothers'], a: 1, cat: 'Directors & Cast' },
  { q: 'A man wakes up reliving the same day over and over in a small town. Name the film.', choices: ['Edge of Tomorrow', 'Source Code', 'Groundhog Day', '12 Monkeys'], a: 2, cat: 'Guess the Movie' },
  { q: 'What year did Titanic (James Cameron) release?', choices: ['1994', '1995', '1997', '1999'], a: 2, cat: 'Plot & Story' },
  { q: "In The Dark Knight, what is the Joker's actor's name?", choices: ['Jack Nicholson', 'Joaquin Phoenix', 'Heath Ledger', 'Jared Leto'], a: 2, cat: 'Directors & Cast' },
  { q: 'A janitor at MIT solves a nearly impossible math problem on a chalkboard. Name the film.', choices: ['A Beautiful Mind', 'Good Will Hunting', 'Pi', 'Proof'], a: 1, cat: 'Guess the Movie' },
  { q: "Which film ends with the reveal that the narrator's imaginary friend is Tyler Durden?", choices: ['American Psycho', 'Shutter Island', 'Fight Club', 'Black Swan'], a: 2, cat: 'Plot & Story' },
  { q: 'Who played Hermione Granger in the Harry Potter series?', choices: ['Emma Watson', 'Emma Stone', 'Keira Knightley', 'Natalie Portman'], a: 0, cat: 'Directors & Cast' },
  { q: 'A young lion cub flees after his father is murdered by his uncle. Name the film.', choices: ['Bambi', 'The Jungle Book', 'The Lion King', 'Brother Bear'], a: 2, cat: 'Guess the Movie' },
  { q: 'In Avengers: Infinity War, which stone does Thanos get from Vision?', choices: ['Time Stone', 'Space Stone', 'Mind Stone', 'Soul Stone'], a: 2, cat: 'Plot & Story' },
  { q: 'Which director made Schindler\'s List, Saving Private Ryan, and Jurassic Park?', choices: ['James Cameron', 'Steven Spielberg', 'Peter Jackson', 'Ron Howard'], a: 1, cat: 'Directors & Cast' },
  { q: 'Which 1942 film features the line "Here\'s looking at you, kid"?', choices: ['Casablanca', 'Gone with the Wind', 'Citizen Kane', 'The Maltese Falcon'], a: 0, cat: 'Classic Films' },
  { q: 'Who directed Jaws (1975)?', choices: ['George Lucas', 'Steven Spielberg', 'Ridley Scott', 'Brian De Palma'], a: 1, cat: 'Directors & Cast' },
  { q: 'In what year was The Godfather released?', choices: ['1969', '1972', '1975', '1978'], a: 1, cat: 'Classic Films' },
  { q: 'Who directed Citizen Kane (1941)?', choices: ['Orson Welles', 'Alfred Hitchcock', 'John Ford', 'Billy Wilder'], a: 0, cat: 'Directors & Cast' },
  { q: 'Who directed 2001: A Space Odyssey?', choices: ['Stanley Kubrick', 'Ridley Scott', 'George Lucas', 'Andrei Tarkovsky'], a: 0, cat: 'Sci-Fi' },
  { q: 'Who starred as Travis Bickle in Taxi Driver (1976)?', choices: ['Al Pacino', 'Robert De Niro', 'Jack Nicholson', 'Dustin Hoffman'], a: 1, cat: 'Classic Films' },
  { q: 'Who directed Psycho (1960)?', choices: ['Alfred Hitchcock', 'Stanley Kubrick', 'Orson Welles', 'Roman Polanski'], a: 0, cat: 'Horror' },
  { q: 'In what year was Gone with the Wind released?', choices: ['1935', '1939', '1942', '1946'], a: 1, cat: 'Classic Films' },
  { q: 'The Shawshank Redemption is based on a story by which author?', choices: ['John Grisham', 'Stephen King', 'James Patterson', 'Tom Clancy'], a: 1, cat: 'Plot & Story' },
  { q: 'Who directed Avatar (2009)?', choices: ['Christopher Nolan', 'James Cameron', 'Peter Jackson', 'Ridley Scott'], a: 1, cat: 'Modern Blockbusters' },
  { q: 'Which 2019 film became the highest-grossing film of all time?', choices: ['Avatar', 'Avengers: Endgame', 'Titanic', 'Star Wars: The Force Awakens'], a: 1, cat: 'Box Office Records' },
  { q: 'In what year was The Matrix released?', choices: ['1995', '1997', '1999', '2001'], a: 2, cat: 'Sci-Fi' },
  { q: 'Who directed Gladiator (2000)?', choices: ['Ridley Scott', 'Zack Snyder', 'Wolfgang Petersen', 'Mel Gibson'], a: 0, cat: 'Modern Blockbusters' },
  { q: 'Which film won Best Picture at the 92nd Academy Awards?', choices: ['1917', 'Joker', 'Parasite', 'Once Upon a Time in Hollywood'], a: 2, cat: 'Oscar Winners' },
  { q: 'Who won Best Actor for Joker (2019)?', choices: ['Joaquin Phoenix', 'Heath Ledger', 'Jared Leto', 'Adam Driver'], a: 0, cat: 'Oscar Winners' },
  { q: 'In what year was Top Gun: Maverick released?', choices: ['2019', '2020', '2021', '2022'], a: 3, cat: 'Modern Blockbusters' },
  { q: 'Who directed Barbie (2023)?', choices: ['Greta Gerwig', 'Patty Jenkins', 'Sofia Coppola', 'Chloé Zhao'], a: 0, cat: 'Directors & Cast' },
  { q: 'Who directed Oppenheimer (2023)?', choices: ['Denis Villeneuve', 'Christopher Nolan', 'Martin Scorsese', 'Ridley Scott'], a: 1, cat: 'Modern Blockbusters' },
  { q: 'Who directed Dune (2021)?', choices: ['Denis Villeneuve', 'David Lynch', 'Ridley Scott', 'Christopher Nolan'], a: 0, cat: 'Sci-Fi' },
  { q: 'Which 1995 film was the first fully computer-animated feature?', choices: ['A Bug\'s Life', 'Toy Story', 'Antz', 'Shrek'], a: 1, cat: 'Animated' },
  { q: 'Which song does Elsa sing in Frozen?', choices: ['Let It Go', 'Into the Unknown', 'How Far I\'ll Go', 'Colors of the Wind'], a: 0, cat: 'Scores & Soundtracks' },
  { q: 'Who directed Spirited Away?', choices: ['Hayao Miyazaki', 'Isao Takahata', 'Makoto Shinkai', 'Satoshi Kon'], a: 0, cat: 'International Cinema' },
  { q: 'Which studio made Shrek?', choices: ['Pixar', 'DreamWorks', 'Illumination', 'Blue Sky'], a: 1, cat: 'Animated' },
  { q: 'Who directed The Incredibles (2004)?', choices: ['Brad Bird', 'Andrew Stanton', 'Pete Docter', 'John Lasseter'], a: 0, cat: 'Animated' },
  { q: 'In Up (2009), what does Carl use to lift his house?', choices: ['Hot air balloons', 'Helium balloons', 'A giant kite', 'Rockets'], a: 1, cat: 'Animated' },
  { q: 'Coco (2017) is set during which holiday?', choices: ['Halloween', 'Día de los Muertos', 'Christmas', 'Carnival'], a: 1, cat: 'Animated' },
  { q: 'Who voices Woody in Toy Story?', choices: ['Tim Allen', 'Tom Hanks', 'Billy Crystal', 'Robin Williams'], a: 1, cat: 'Animated' },
  { q: 'Who directed Finding Nemo (2003)?', choices: ['Andrew Stanton', 'Brad Bird', 'Pete Docter', 'Lee Unkrich'], a: 0, cat: 'Animated' },
  { q: 'Who directed The Shining (1980)?', choices: ['Stanley Kubrick', 'Stephen King', 'Brian De Palma', 'John Carpenter'], a: 0, cat: 'Horror' },
  { q: 'Which masked killer stalks Haddonfield in Halloween (1978)?', choices: ['Jason Voorhees', 'Michael Myers', 'Freddy Krueger', 'Leatherface'], a: 1, cat: 'Horror' },
  { q: 'Who directed Get Out (2017)?', choices: ['Jordan Peele', 'Ari Aster', 'Robert Eggers', 'M. Night Shyamalan'], a: 0, cat: 'Horror' },
  { q: 'Who directed A Quiet Place (2018)?', choices: ['John Krasinski', 'Emily Blunt', 'Jordan Peele', 'James Wan'], a: 0, cat: 'Horror' },
  { q: 'Which studio produced Hereditary and Midsommar?', choices: ['Blumhouse', 'A24', 'Neon', 'Lionsgate'], a: 1, cat: 'Horror' },
  { q: 'Who directed Blade Runner (1982)?', choices: ['Ridley Scott', 'Denis Villeneuve', 'James Cameron', 'George Lucas'], a: 0, cat: 'Sci-Fi' },
  { q: 'Who directed Interstellar (2014)?', choices: ['Christopher Nolan', 'Denis Villeneuve', 'Ridley Scott', 'Alfonso Cuarón'], a: 0, cat: 'Sci-Fi' },
  { q: 'Who plays the Terminator in the 1984 film?', choices: ['Sylvester Stallone', 'Arnold Schwarzenegger', 'Bruce Willis', 'Jean-Claude Van Damme'], a: 1, cat: 'Sci-Fi' },
  { q: 'Who directed Alien (1979)?', choices: ['Ridley Scott', 'James Cameron', 'John Carpenter', 'George Miller'], a: 0, cat: 'Sci-Fi' },
  { q: 'In what year was Star Wars: A New Hope released?', choices: ['1975', '1977', '1980', '1983'], a: 1, cat: 'Franchise Knowledge' },
  { q: 'Who plays Ron Burgundy in Anchorman?', choices: ['Will Ferrell', 'Steve Carell', 'Paul Rudd', 'Ben Stiller'], a: 0, cat: 'Comedy' },
  { q: 'Who directed The Big Lebowski?', choices: ['Coen Brothers', 'Wes Anderson', 'Judd Apatow', 'Kevin Smith'], a: 0, cat: 'Comedy' },
  { q: 'In what year was Superbad released?', choices: ['2005', '2007', '2009', '2011'], a: 1, cat: 'Comedy' },
  { q: 'Who stars as Phil Connors in Groundhog Day?', choices: ['Bill Murray', 'Chevy Chase', 'Steve Martin', 'Dan Aykroyd'], a: 0, cat: 'Comedy' },
  { q: 'Who co-wrote and starred in Bridesmaids (2011)?', choices: ['Kristen Wiig', 'Tina Fey', 'Amy Poehler', 'Melissa McCarthy'], a: 0, cat: 'Comedy' },
  { q: 'Which three films each won 11 Academy Awards?', choices: ['Ben-Hur, Titanic, Return of the King', 'Titanic, Gladiator, Avatar', 'Ben-Hur, Casablanca, Rocky', 'Titanic, Chicago, Slumdog Millionaire'], a: 0, cat: 'Oscar Winners' },
  { q: 'Which actor holds the most Oscar acting nominations?', choices: ['Jack Nicholson', 'Meryl Streep', 'Robert De Niro', 'Katharine Hepburn'], a: 1, cat: 'Oscar Winners' },
  { q: 'How many Best Actor Oscars did Daniel Day-Lewis win?', choices: ['1', '2', '3', '4'], a: 2, cat: 'Oscar Winners' },
  { q: 'Which film was the first non-English-language winner of Best Picture?', choices: ['Roma', 'Parasite', 'Life is Beautiful', 'Crouching Tiger, Hidden Dragon'], a: 1, cat: 'Oscar Winners' },
  { q: 'Who has won the most competitive Oscars of any person?', choices: ['Walt Disney', 'Steven Spielberg', 'John Williams', 'Meryl Streep'], a: 0, cat: 'Oscar Winners' },
  { q: 'Who directed The Departed (2006)?', choices: ['Martin Scorsese', 'Francis Ford Coppola', 'Michael Mann', 'Brian De Palma'], a: 0, cat: 'Directors & Cast' },
  { q: 'What was Quentin Tarantino\'s feature directorial debut?', choices: ['Pulp Fiction', 'Reservoir Dogs', 'Jackie Brown', 'Kill Bill'], a: 1, cat: 'Directors & Cast' },
  { q: 'Who directed Se7en (1995)?', choices: ['David Fincher', 'Guy Ritchie', 'Michael Bay', 'Tony Scott'], a: 0, cat: 'Directors & Cast' },
  { q: 'Who directed The Grand Budapest Hotel?', choices: ['Wes Anderson', 'Noah Baumbach', 'Taika Waititi', 'Edgar Wright'], a: 0, cat: 'Directors & Cast' },
  { q: 'Who directed E.T. the Extra-Terrestrial?', choices: ['Steven Spielberg', 'George Lucas', 'Robert Zemeckis', 'Richard Donner'], a: 0, cat: 'Directors & Cast' },
  { q: 'Who composed the Star Wars and Jaws scores?', choices: ['John Williams', 'Hans Zimmer', 'Ennio Morricone', 'Danny Elfman'], a: 0, cat: 'Scores & Soundtracks' },
  { q: 'Who composed the score for Inception and Interstellar?', choices: ['Hans Zimmer', 'John Williams', 'Alexandre Desplat', 'Ludwig Göransson'], a: 0, cat: 'Scores & Soundtracks' },
  { q: 'Who composed the score for The Good, the Bad and the Ugly?', choices: ['Ennio Morricone', 'Nino Rota', 'John Barry', 'Vangelis'], a: 0, cat: 'Scores & Soundtracks' },
  { q: 'Who sings "My Heart Will Go On" from Titanic?', choices: ['Celine Dion', 'Whitney Houston', 'Mariah Carey', 'Adele'], a: 0, cat: 'Scores & Soundtracks' },
  { q: 'Which 1997 film was the first to gross $1 billion worldwide?', choices: ['Jurassic Park', 'Titanic', 'The Phantom Menace', 'The Lion King'], a: 1, cat: 'Box Office Records' },
  { q: 'Which franchise has grossed the most worldwide?', choices: ['Star Wars', 'Marvel Cinematic Universe', 'Harry Potter', 'James Bond'], a: 1, cat: 'Box Office Records' },
  { q: 'What color are Dorothy\'s famous shoes in The Wizard of Oz (1939)?', choices: ['Silver', 'Ruby red', 'Emerald', 'Gold'], a: 1, cat: 'Behind the Scenes' },
  { q: 'What was the nickname of the mechanical shark in Jaws?', choices: ['Bruce', 'Jawsy', 'Chomper', 'Moby'], a: 0, cat: 'Behind the Scenes' },
  { q: 'Where was The Lord of the Rings trilogy filmed?', choices: ['Australia', 'New Zealand', 'Iceland', 'Ireland'], a: 1, cat: 'Behind the Scenes' },
  { q: 'In Infinity War, what does Thanos collect to erase half of life?', choices: ['The Infinity Stones', 'The Elder Wand', 'The One Ring', 'The Tesseract'], a: 0, cat: 'Franchise Knowledge' },
  { q: 'Which Hogwarts house values bravery?', choices: ['Slytherin', 'Ravenclaw', 'Hufflepuff', 'Gryffindor'], a: 3, cat: 'Franchise Knowledge' },
  { q: 'Where is the One Ring destroyed in The Lord of the Rings?', choices: ['Mount Doom', 'Minas Tirith', 'The Shire', 'Isengard'], a: 0, cat: 'Franchise Knowledge' },
  { q: 'Which catchphrase is tied to the Fast & Furious films?', choices: ['"Family"', '"Avengers assemble"', '"May the Force be with you"', '"Wingardium Leviosa"'], a: 0, cat: 'Franchise Knowledge' },
  { q: 'Who directed Star Wars: The Force Awakens?', choices: ['J.J. Abrams', 'Rian Johnson', 'George Lucas', 'Gareth Edwards'], a: 0, cat: 'Franchise Knowledge' },
  { q: 'Which film launched the Marvel Cinematic Universe in 2008?', choices: ['Iron Man', 'The Incredible Hulk', 'Thor', 'Captain America'], a: 0, cat: 'Franchise Knowledge' },
  { q: 'Bollywood is primarily based in which Indian city?', choices: ['Delhi', 'Mumbai', 'Chennai', 'Kolkata'], a: 1, cat: 'International Cinema' },
  { q: 'Who directed the South Korean film Parasite?', choices: ['Bong Joon-ho', 'Park Chan-wook', 'Kim Jee-woon', 'Na Hong-jin'], a: 0, cat: 'International Cinema' },
  { q: 'Which Japanese studio produced Spirited Away and My Neighbor Totoro?', choices: ['Studio Ghibli', 'Toei Animation', 'Madhouse', 'Kyoto Animation'], a: 0, cat: 'International Cinema' },
  { q: 'Who directed Crouching Tiger, Hidden Dragon?', choices: ['Ang Lee', 'Zhang Yimou', 'Wong Kar-wai', 'John Woo'], a: 0, cat: 'International Cinema' },
  { q: 'Amélie (2001) is a film from which country?', choices: ['Italy', 'France', 'Spain', 'Belgium'], a: 1, cat: 'International Cinema' },
  { q: 'City of God (2002) is set in which country?', choices: ['Mexico', 'Brazil', 'Argentina', 'Colombia'], a: 1, cat: 'International Cinema' },
  { q: 'Train to Busan (2016) is a zombie film from which country?', choices: ['Japan', 'South Korea', 'Thailand', 'China'], a: 1, cat: 'International Cinema' },
  { q: 'Who directed the 1954 classic Seven Samurai?', choices: ['Akira Kurosawa', 'Yasujirō Ozu', 'Kenji Mizoguchi', 'Hayao Miyazaki'], a: 0, cat: 'International Cinema' },
  { q: 'Who directed and starred in Life is Beautiful (1997)?', choices: ['Roberto Benigni', 'Federico Fellini', 'Vittorio De Sica', 'Paolo Sorrentino'], a: 0, cat: 'International Cinema' },
  { q: 'Who directed It\'s a Wonderful Life (1946)?', choices: ['Frank Capra', 'Alfred Hitchcock', 'John Ford', 'William Wyler'], a: 0, cat: 'Classic Films' },
  { q: 'Who directed Vertigo (1958)?', choices: ['Alfred Hitchcock', 'Orson Welles', 'Billy Wilder', 'Stanley Kubrick'], a: 0, cat: 'Classic Films' },
  { q: 'In what year was Singin\' in the Rain released?', choices: ['1948', '1952', '1956', '1960'], a: 1, cat: 'Classic Films' },
  { q: 'Who stars as Sugar Kane in Some Like It Hot (1959)?', choices: ['Marilyn Monroe', 'Audrey Hepburn', 'Grace Kelly', 'Doris Day'], a: 0, cat: 'Classic Films' },
  { q: 'Who stars as Maria in The Sound of Music (1965)?', choices: ['Julie Andrews', 'Audrey Hepburn', 'Barbra Streisand', 'Debbie Reynolds'], a: 0, cat: 'Classic Films' },
  { q: 'Who directed La La Land (2016)?', choices: ['Damien Chazelle', 'Baz Luhrmann', 'Rob Marshall', 'Tom Hooper'], a: 0, cat: 'Modern Blockbusters' },
  { q: 'Who directed Mad Max: Fury Road (2015)?', choices: ['George Miller', 'Ridley Scott', 'James Cameron', 'Peter Jackson'], a: 0, cat: 'Modern Blockbusters' },
  { q: 'Which film won Best Picture at the 95th Academy Awards?', choices: ['Everything Everywhere All at Once', 'The Banshees of Inisherin', 'Elvis', 'Tár'], a: 0, cat: 'Oscar Winners' },
  { q: 'Which actor won a posthumous Oscar for The Dark Knight?', choices: ['Heath Ledger', 'Joaquin Phoenix', 'Chadwick Boseman', 'Philip Seymour Hoffman'], a: 0, cat: 'Oscar Winners' },
  { q: 'Which 2018 Marvel film won the first MCU Oscar?', choices: ['Black Panther', 'Avengers: Infinity War', 'Spider-Man: Homecoming', 'Doctor Strange'], a: 0, cat: 'Oscar Winners' },
  { q: 'Who directed Gravity (2013)?', choices: ['Alfonso Cuarón', 'Christopher Nolan', 'Ridley Scott', 'Denis Villeneuve'], a: 0, cat: 'Sci-Fi' },
  { q: 'Who directed Roma (2018)?', choices: ['Alfonso Cuarón', 'Guillermo del Toro', 'Alejandro González Iñárritu', 'Diego Luna'], a: 0, cat: 'International Cinema' },
  { q: 'Which 1939 film features a tornado carrying a house to Oz?', choices: ['The Wizard of Oz', 'Gone with the Wind', 'Fantasia', 'Mr. Smith Goes to Washington'], a: 0, cat: 'Classic Films' },
];
interface MVState extends LiveState { phase: 'waiting' | 'question' | 'buzzed' | 'reveal' | 'done'; qIndex: number; qOrder: number[]; buzzedUid: string | null; buzzOrder: string[]; correctUid: string | null; picked: number | null; }
function init(): MVState { return { phase: 'waiting', qIndex: 0, qOrder: [], buzzedUid: null, buzzOrder: [], correctUid: null, picked: null }; }
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
function questionAt(s: MVState): number {
  const order = s.qOrder && s.qOrder.length ? s.qOrder : null;
  return order ? (order[s.qIndex] ?? s.qIndex) : s.qIndex;
}
function applyAction(state: LiveState, action: Action): LiveState {
  const s = state as MVState;
  switch (action.type) {
    case 'ask': return { ...s, phase: 'question', qIndex: action.payload?.qIndex ?? 0, qOrder: Array.isArray(action.payload?.qOrder) && action.payload.qOrder.length ? action.payload.qOrder : shuffledOrder(QUESTIONS.length), buzzedUid: null, buzzOrder: [], correctUid: null, picked: null };
    case 'buzz': if (s.phase !== 'question' || (s.buzzOrder || []).includes(action.uid)) return s; return { ...s, phase: 'buzzed', buzzedUid: action.uid, buzzOrder: [...(s.buzzOrder || []), action.uid] };
    case 'answer': { const correct = action.payload.choice === QUESTIONS[questionAt(s)]!.a; return correct ? { ...s, phase: 'reveal', correctUid: action.uid, picked: action.payload.choice } : { ...s, phase: 'question', buzzedUid: null, picked: action.payload.choice }; }
    case 'next': { const qIndex = s.qIndex + 1; return qIndex >= QUESTIONS.length ? { ...s, phase: 'done' } : { ...s, phase: 'question', qIndex, buzzedUid: null, buzzOrder: [], correctUid: null, picked: null }; }
    case 'end': return { ...s, phase: 'done' };
    default: return s;
  }
}
function CinemaScene({ players, buzzedUid, correctUid }: { players: RoomMeta['players']; buzzedUid: string | null; correctUid: string | null }) {
  const spotRef = useRef<any>(null); const reelRef = useRef<any>(null);
  useFrame(({ clock }) => { const t = clock.getElapsedTime(); if (spotRef.current) spotRef.current.intensity = buzzedUid ? 35 + Math.sin(t * 9) * 12 : 14; if (reelRef.current) reelRef.current.rotation.z = t * 0.6; });
  return <group><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}><planeGeometry args={[26, 16]} /><meshStandardMaterial color="#0a0a1c" roughness={0.9} /></mesh><mesh position={[0, 2.2, -5.5]}><planeGeometry args={[9, 4]} /><meshStandardMaterial color="#e8e0d0" emissive="#fffbe8" emissiveIntensity={buzzedUid ? 0.6 : 0.2} roughness={0.7} /></mesh><group ref={reelRef} position={[6, 3.5, -3]}><mesh><torusGeometry args={[0.55, 0.1, 8, 24]} /><meshStandardMaterial color="#888" metalness={0.8} roughness={0.3} /></mesh><mesh><circleGeometry args={[0.38, 24]} /><meshStandardMaterial color="#222" /></mesh></group><pointLight ref={spotRef} position={[0, 8, 2]} intensity={14} distance={22} color={correctUid ? '#34D399' : buzzedUid ? '#FF3D81' : '#fffbe8'} />{[-3, -1, 1, 3].map((x) => <mesh key={x} position={[x * 1.5, 0.35, 2.5]}><boxGeometry args={[0.9, 0.7, 0.5]} /><meshStandardMaterial color="#1e1e3c" roughness={0.8} /></mesh>)}{players.map((p, i) => { const x = (i - (players.length - 1) / 2) * 2.1; const hot = p.uid === (correctUid ?? buzzedUid); return <group key={p.uid} position={[x, 0, 0.5]}><mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.5, 0.6, 0.6, 16]} /><meshStandardMaterial color={correctUid === p.uid ? '#34D399' : hot ? '#FF3D81' : '#1e1e3c'} emissive={hot ? (correctUid === p.uid ? '#34D399' : '#FF3D81') : '#000'} emissiveIntensity={hot ? 0.9 : 0} /></mesh><Avatar3D color={p.avatarColor} name={p.name} position={[0, 0.6, 0]} highlight={hot} /></group>; })}</group>;
}
function GameScene({ roomCode }: { roomCode: string }) {
  const uid = useMemo(() => getSessionUid(), []); const [live, setL] = useState<MVState | null>(null); const [room, setRoom] = useState<RoomMeta | null>(null);
  useEffect(() => subscribeLive(roomCode, (s) => setL((s as MVState) ?? null)), [roomCode]); useEffect(() => subscribeRoom(roomCode, setRoom), [roomCode]);
  const isHost = room?.hostId === uid; const qIdx = live ? questionAt(live) : 0; const q = live ? QUESTIONS[qIdx] : null; const myTurn = live?.buzzedUid === uid; const lockedOut = !!live && live.phase === 'question' && (live.buzzOrder || []).includes(uid) && (live.buzzOrder || [])[0] !== uid;
  const act = (type: string, payload: any = {}) => dispatchLive(roomCode, { type, uid, payload }, applyAction, init);
  const startTrivia = () => act('ask', { qIndex: 0, qOrder: shuffledOrder(QUESTIONS.length) });
  const buzz = () => { act('buzz'); flashBuzzer('#buzz-btn', '#FF3D81'); }; const answer = (choice: number) => { const correct = choice === QUESTIONS[qIdx]!.a; if (correct) { void awardScores(roomCode, { [uid]: 100 }); flashBuzzer('#mv-quiz-card', '#34D399'); } act('answer', { choice }); };
  return <div className="flex h-full flex-col gap-2"><GameHeader name="Movie Trivia" accent="#FFC53D" phase={live?.phase} round={`Q${(live?.qIndex ?? 0) + 1}/${QUESTIONS.length}`} playerCount={room?.players.length} /><div className="flex h-full flex-col gap-2 lg:flex-row"><div className="relative min-h-[300px] flex-1 overflow-hidden rounded-2xl border border-white/10"><Canvas camera={{ position: [0, 5, 10], fov: 50 }} dpr={[1, 1.75]}><color attach="background" args={['#080818']} /><ambientLight intensity={0.35} /><directionalLight position={[4, 7, 3]} intensity={0.6} />{room && <CinemaScene players={room.players} buzzedUid={live?.buzzedUid ?? null} correctUid={live?.correctUid ?? null} />}</Canvas>{q && <div className="absolute bottom-3 left-3 right-3 arcade-card px-3 py-1.5 text-center"><span className="text-xs font-bold uppercase tracking-widest text-[#FFC53D]">{q.cat}</span><span className="mx-2 text-white/30">·</span><span className="text-xs text-white/60">Q{live!.qIndex + 1} / {QUESTIONS.length}</span></div>}</div><div className="flex w-full flex-col gap-2 lg:w-96">
    {(!live || live.phase === 'waiting') && <div className="arcade-card p-4"><div className="font-display text-lg font-extrabold">🎬 Movie Trivia</div><p className="mt-1 text-sm text-white/70">{QUESTIONS.length} questions · Plot, Cast, Guess-the-Movie. Buzz in first, answer correctly for +100.</p>{isHost ? <button onClick={startTrivia} className="btn-neon mt-3 w-full rounded-xl px-3 py-2 text-sm font-bold">🎬 Start Trivia</button> : <p className="mt-2 text-sm text-white/60">Waiting for host…</p>}</div>}
    {live && (live.phase === 'question' || live.phase === 'buzzed') && q && <div id="mv-quiz-card" className="arcade-card p-4"><div className="mb-1 text-xs font-bold uppercase tracking-widest text-[#FFC53D]">{q.cat} · Q{live.qIndex + 1}</div><div className="font-display text-lg font-extrabold leading-snug">{q.q}</div>{live.phase === 'question' && !lockedOut && <button id="buzz-btn" onClick={buzz} className="btn-neon mt-3 w-full rounded-xl px-3 py-3 font-display text-xl font-extrabold">🎬 BUZZ IN</button>}{lockedOut && <p className="mt-2 text-sm text-white/60">You answered wrong — locked out this question.</p>}{live.phase === 'buzzed' && <p className="mt-2 text-sm font-bold text-[#FF3D81]">{myTurn ? '🎯 You have the mic — pick your answer!' : `${room?.players.find((p) => p.uid === live.buzzedUid)?.name} is answering…`}</p>}<div className="mt-2 grid gap-1.5">{q.choices.map((c, i) => <button key={i} disabled={!myTurn} onClick={() => answer(i)} className={`rounded-xl px-3 py-2 text-left text-sm font-semibold ${myTurn ? 'bg-white/10 hover:bg-[#FF3D81]/40' : 'bg-white/5 text-white/60'}`}>{String.fromCharCode(65 + i)}. {c}</button>)}</div>{isHost && <button onClick={() => act('next')} className="mt-2 w-full rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">Skip →</button>}</div>}
    {live?.phase === 'reveal' && q && <div className="arcade-card border-[#34D399]/50 p-4 text-center"><div className="font-display text-xl font-extrabold text-[#34D399]">✅ {room?.players.find((p) => p.uid === live.correctUid)?.name} scores +100!</div><p className="mt-1 text-sm text-white/70">Answer: {q.choices[q.a]}</p>{isHost && <div className="mt-2 flex gap-1"><button onClick={() => act('next')} className="btn-neon flex-1 rounded-xl px-3 py-2 text-sm font-bold">Next question</button><button onClick={() => act('end')} className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold">Finish</button></div>}</div>}
    {live?.phase === 'done' && <div className="arcade-card phase-fade relative p-4 text-center"><Confetti /><div className="font-display text-xl font-extrabold">🎬 That's a wrap! 🎉</div>{isHost && <ReturnToLounge roomCode={roomCode} className="mt-2" />}</div>}
  </div></div></div>;
}
function Preview() { const reelRef = useRef<any>(null); const screenRef = useRef<any>(null); useFrame(({ clock }) => { const t = clock.getElapsedTime(); if (reelRef.current) reelRef.current.rotation.z = t * 0.8; if (screenRef.current) screenRef.current.material.emissiveIntensity = 0.3 + Math.sin(t * 2) * 0.2; }); return <group><mesh ref={screenRef} position={[0, 0.3, -0.3]}><planeGeometry args={[1.8, 0.9]} /><meshStandardMaterial color="#e8e0d0" emissive="#fffbe8" emissiveIntensity={0.3} /></mesh><group ref={reelRef} position={[0.9, 0.8, 0]}><mesh><torusGeometry args={[0.28, 0.06, 6, 16]} /><meshStandardMaterial color="#888" metalness={0.8} /></mesh></group></group>; }
export const MovieTrivia: GameModule = { id: 'movietrivia', displayName: 'Movie Trivia', tagline: 'Lights, camera, buzz in!', minPlayers: 2, maxPlayers: 8, accent: '#FFC53D', LobbyPreviewScene: Preview, GameScene, applyAction, initState: () => init() };
