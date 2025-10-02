function uid() { return Math.random().toString(36).slice(2)+Date.now().toString(36) }
const STORAGE_KEY = 'studybuddy_v1';

function defaultState() {
  return {
    decks: [],
    cards: [],
    settings: { dailyGoal: 30, shuffle: true },
    stats: { correctToday: 0, lastDate: new Date().toDateString(), streak: 0 },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch { return defaultState(); }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function todayStr() { return new Date().toDateString(); }

function studyBuddy() {
  return {
    decks: [], cards: [], settings: {}, stats: {},
    activeDeckId: null,
    newDeckName: '', newFront: '', newBack: '',
    quiz: { active:false, queue:[], current:null, index:0, revealed:false, userAnswer:'' },

    init() {
      const s = loadState();
      this.decks = s.decks; this.cards = s.cards;
      this.settings = s.settings; this.stats = s.stats;
      if (this.stats.lastDate !== todayStr()) {
        this.stats.correctToday = 0; this.stats.lastDate = todayStr();
        saveState(this.snapshot());
      }
      // wire CSV
      document.getElementById('exportBtn').addEventListener('click', ()=> this.exportCSV());
      document.getElementById('importInput').addEventListener('change', (e)=> this.importCSV(e.target.files[0]));
    },
    snapshot() { return { decks:this.decks, cards:this.cards, settings:this.settings, stats:this.stats }; },
    persist() { saveState(this.snapshot()); },

    setActive(id) { this.activeDeckId = id; },
    get activeDeck() { return this.decks.find(d=>d.id===this.activeDeckId) || null; },
    countCards(deckId) { return this.cards.filter(c=>c.deckId===deckId).length; },
    cardsForActive() { return this.cards.filter(c=>c.deckId===this.activeDeckId); },

    addDeck() {
      const name = this.newDeckName.trim();
      if (!name) return;
      const deck = { id: uid(), name };
      this.decks.push(deck);
      this.newDeckName=''; this.setActive(deck.id); this.persist();
    },
    renameDeck(id) {
      const d = this.decks.find(x=>x.id===id); if(!d) return;
      const name = prompt('New deck name:', d.name); if(!name) return;
      d.name = name; this.persist();
    },
    deleteDeck(id) {
      if (!confirm('Delete this deck and its cards?')) return;
      this.decks = this.decks.filter(d=>d.id!==id);
      this.cards = this.cards.filter(c=>c.deckId!==id);
      if (this.activeDeckId===id) this.activeDeckId=null;
      this.persist();
    },

    addCard() {
      if (!this.activeDeck) return;
      const front = this.newFront.trim(), back = this.newBack.trim();
      if (!front || !back) return;
      this.cards.push({ id: uid(), deckId: this.activeDeckId, front, back, ef:2.5, interval:0, due:Date.now() });
      this.newFront=''; this.newBack=''; this.persist();
    },
    editCard(id) {
      const c = this.cards.find(x=>x.id===id); if(!c) return;
      const nf = prompt('Front:', c.front); if(nf===null) return;
      const nb = prompt('Back:', c.back); if(nb===null) return;
      c.front = nf; c.back = nb; this.persist();
    },
    deleteCard(id) {
      this.cards = this.cards.filter(c=>c.id!==id); this.persist();
    },

    startQuiz() {
      let pool = this.cardsForActive();
      if (this.settings.shuffle) {
        pool = pool.sort(()=>Math.random()-0.5);
      }
      // basic spaced repetition: prioritize due soonest
      pool = pool.sort((a,b)=> (a.due||0)-(b.due||0));
      this.quiz.queue = pool;
      this.quiz.index = 0;
      this.quiz.current = this.quiz.queue[0];
      this.quiz.revealed = false;
      this.quiz.userAnswer = '';
      this.quiz.active = this.quiz.queue.length>0;
    },
    grade(correct) {
      if (!this.quiz.active) return;
      // SuperMemo-lite
      const q = this.quiz.current;
      if (correct) {
        this.stats.correctToday++;
        q.interval = q.interval===0 ? 1 : Math.ceil(q.interval * q.ef);
        q.ef = Math.min(2.7, q.ef + 0.1);
      } else {
        q.interval = 1;
        q.ef = Math.max(1.3, q.ef - 0.2);
      }
      q.due = Date.now() + q.interval*24*60*60*1000;
      // streak
      if (this.stats.correctToday >= 1 && this.stats.lastDate===todayStr()) {
        // minimal; more robust tracking could be added
      }
      this.persist();
      // next
      this.quiz.index++;
      if (this.quiz.index >= this.quiz.queue.length) {
        this.quiz.active = false;
        alert('Session complete! Great job.');
      } else {
        this.quiz.current = this.quiz.queue[this.quiz.index];
        this.quiz.revealed = false;
        this.quiz.userAnswer='';
      }
    },

    exportCSV() {
      const rows = [['deck','front','back']];
      for (const d of this.decks) {
        for (const c of this.cards.filter(x=>x.deckId===d.id)) {
          rows.push([d.name, c.front, c.back]);
        }
      }
      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'studybuddy_export.csv'; a.click();
      URL.revokeObjectURL(url);
    },
    importCSV(file) {
      if (!file) return;
      Papa.parse(file, {
        complete: (res)=>{
          const data = res.data;
          // expect header deck,front,back
          const [h0,h1,h2] = (data[0]||[]).map(x=>String(x||'').toLowerCase());
          const rows = data.slice( (h0==='deck' && h1==='front' && h2==='back') ? 1 : 0 );
          const nameToId = new Map(this.decks.map(d=>[d.name,d.id]));
          for (const row of rows) {
            if (row.length<3) continue;
            const deckName = String(row[0]).trim();
            const front = String(row[1]).trim();
            const back = String(row[2]).trim();
            if (!deckName || !front || !back) continue;
            if (!nameToId.has(deckName)) {
              const id = uid();
              this.decks.push({id, name:deckName});
              nameToId.set(deckName, id);
            }
            this.cards.push({ id: uid(), deckId: nameToId.get(deckName), front, back, ef:2.5, interval:0, due:Date.now() });
          }
          this.persist();
          alert('Import complete.');
        }
      });
    },
  };
}
