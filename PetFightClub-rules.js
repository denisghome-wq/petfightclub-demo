const SPECIES = {
  dog:{name:'Собака', stat:'str', talent:'сила', avatar:'🐶'},
  cat:{name:'Кошка', stat:'dex', talent:'точность', avatar:'🐱'},
  bird:{name:'Птица', stat:'agi', talent:'ловкость', avatar:'🦜'},
  fish:{name:'Рыба', stat:'luck', talent:'удача', avatar:'🐟'},
  reptile:{name:'Рептилия', stat:'str', talent:'сила', avatar:'🦎'},
  rodent:{name:'Грызун', stat:'agi', talent:'ловкость', avatar:'🐹'}
};
const START_STATS = Object.freeze({str:1, agi:1, vit:1, dex:1, luck:1});
const STAT_KEYS = Object.keys(START_STATS);

const BOT_NAMES = {
  cat:['Мия','Ника','Лея','Cleo','Oliver','Loki','Pepper','Milo','Shadow'],
  dog:['Тайга','Ася','Марс','Rocky','Cooper','Bailey','Charlie','Scout','Hazel'],
  bird:['Кира','Пикси','Лира','Kiwi','Rio','Sunny','Skye','Piper','Blue'],
  fish:['Немо','Коралл','Вега','Finn','Marina','Pearl','Reef','Caspian','Bubbles'],
  reptile:['Гекко','Гера','Оникс','Echo','Ivy','Jasper','Rex','Ziggy','Spike'],
  rodent:['Тоши','Юки','Бонни','Peanut','Maple','Poppy','Honey','Biscuit','Ollie']
};

function createBotNamePicker(random = Math.random) {
  const pool = Object.entries(BOT_NAMES).flatMap(([species, names]) => names.map(name => ({name, species})));
  let remaining = [];
  let previous;
  return () => {
    if (!remaining.length) remaining = [...pool];
    const index = Math.floor(random() * remaining.length);
    const selected = remaining[index] === previous ? (index + 1) % remaining.length : index;
    [previous] = remaining.splice(selected, 1);
    return previous;
  };
}

function allocatedPoints(stats) {
  return STAT_KEYS.reduce((sum, key) => sum + stats[key] - START_STATS[key], 0);
}

function randomBuild(extraPoints, random = Math.random) {
  const stats = {...START_STATS};
  for (let i = 0; i < extraPoints; i++) stats[STAT_KEYS[Math.floor(random() * STAT_KEYS.length)]]++;
  return stats;
}

function withTalent(fighter) {
  const species = SPECIES[fighter.species];
  const stats = {...fighter.stats};
  if (species) stats[species.stat] += Math.floor(fighter.level / 2);
  return {...fighter, stats};
}

function withEquipment(fighter) {
  const effective = withTalent(fighter);
  for (const trophy of fighter.slots ?? []) {
    if (trophy) effective.stats[trophy.stat] += trophy.bonus;
  }
  return effective;
}

const TROPHY_MATERIALS = {
  dog:['Клык','Клок шерсти','Усы'], cat:['Усы','Клок шерсти','Клык'],
  bird:['Перо','Коготь'], fish:['Чешуя','Плавник'],
  reptile:['Чешуйки','Коготь'], rodent:['Клок шерсти','Усы']
};

function createTrophy(defeated, random = Math.random) {
  const materials = defeated.hasClaws === false
    ? TROPHY_MATERIALS[defeated.species]?.filter(name => name !== 'Коготь')
    : TROPHY_MATERIALS[defeated.species];
  const highest = Math.max(...Object.values(defeated.stats));
  const choices = Object.keys(defeated.stats).filter(stat => defeated.stats[stat] === highest);
  const stat = choices[Math.floor(random() * choices.length)];
  const name = materials?.length > 1 ? materials[Math.floor(random() * materials.length)] : (materials?.[0] ?? 'Трофей');
  return {
    name,
    source:defeated.name,
    stat,
    bonus:Math.min(3, 1 + Math.floor(defeated.level / 6))
  };
}

function health(fighter) {
  const vit = fighter.stats.vit;
  return Math.round((100 + 10 * fighter.level) * (1 + 1.5 * vit / (12 + vit)));
}

function hitChance(accuracy, agility) {
  return Math.max(.50, Math.min(.97, .76 + .048 * accuracy - .028 * agility));
}

function fullDodgeChance(luck) {
  return Math.min(.22, .01 + .010 * luck);
}

function criticalChance(luck) {
  return Math.min(.48, .04 + .031 * luck);
}

function extraAttackChance(agility) {
  return Math.min(.18, .018 * agility);
}

function firstAttackChance(agility, opponentAgility) {
  return agility === opponentAgility ? .5 : Number(agility > opponentAgility);
}

function damageAt(attacker, roll, crit) {
  const {dex, str} = attacker.stats;
  const low = Math.min(1, .76 + .02 * dex);
  const power = (10 + .7 * attacker.level) * (1 + 1.4 * str / (10 + str));
  return Math.round(power * (low + roll * (1.24 - low)) * (crit ? 1.53 : 1));
}

function landedHitChance(attacker, defender) {
  const crit = criticalChance(attacker.luck);
  return (1 - fullDodgeChance(defender.luck)) * (crit + (1 - crit) * hitChance(attacker.dex, defender.agi));
}

function attack(attacker, defender, random) {
  const a = attacker.stats, d = defender.stats;
  if (random() < fullDodgeChance(d.luck)) return {damage:0, crit:false};
  const crit = random() < criticalChance(a.luck);
  if (!crit && random() >= hitChance(a.dex, d.agi)) return {damage:0, crit:false};
  return {damage:damageAt(attacker, random(), crit), crit};
}

function simulate(pet, opponent, random = Math.random) {
  const fighters = [pet, opponent].map(withEquipment);
  const maxHP = fighters.map(health);
  const hp = [...maxHP];
  const log = [];
  const speed = fighters.map(fighter => fighter.stats.agi);
  const firstChance = firstAttackChance(...speed);
  const first = firstChance === .5 ? (random() < .5 ? 0 : 1) : (firstChance === 1 ? 0 : 1);
  const order = [first, 1 - first];
  for (let round = 1; round <= 30 && hp.every(Boolean); round++) {
    for (const who of order) {
      const foe = 1 - who;
      const attempts = random() < extraAttackChance(speed[who]) ? 2 : 1;
      for (let i = 0; i < attempts && hp[foe]; i++) {
        const {damage, crit} = attack(fighters[who], fighters[foe], random);
        hp[foe] = Math.max(0, hp[foe] - damage);
        log.push({round, who, damage, crit, extra:i > 0, hp:[...hp]});
      }
      if (!hp[foe]) break;
    }
  }
  const remaining = hp[0] / maxHP[0] - hp[1] / maxHP[1];
  return {log, maxHP, won:remaining === 0 ? random() < .5 : remaining > 0};
}

const DUEL_LEVEL = 5;
const DUEL_POINTS = 10;

function normalizeDuelPet(pet) {
  const values = Object.entries(pet.stats);
  const total = values.reduce((sum, [, value]) => sum + value, 0);
  return {
    ...pet,
    level: DUEL_LEVEL,
    slots: [],
    stats: Object.fromEntries(values.map(([key, value]) =>
      [key, total ? DUEL_POINTS * value / total : DUEL_POINTS / values.length]))
  };
}

function duel(left, right, random = Math.random) {
  const fighters = [left, right].map(normalizeDuelPet);
  return {...simulate(...fighters, random), fighters};
}

if (typeof module !== 'undefined') module.exports = {SPECIES, START_STATS, allocatedPoints, randomBuild, withTalent, duel, simulate, normalizeDuelPet, DUEL_LEVEL, DUEL_POINTS, createBotNamePicker};
