// how many card copies for different tiers
// ref: https://www.pcgamesn.com/hearthstone/battlegrounds-cards-list
// T1 -> 18, T2 -> 15, T3 -> 13, T4 -> 11, T5 -> 9, T6 -> 7

function randomPick(list) {
   return list[~~(Math.random() * list.length)];
}

function shuffle(list) {
   var i = 0, n = list.length, m = ~~(n / 2);
   for (i = 0; i < m; i++) {
      var j, k, t;
      j = ~~(Math.random() * n);
      k = ~~(Math.random() * n);
      if (j === k) continue;
      t = list[j];
      list[j] = list[k];
      list[k] = t;
   }
   return list;
}

var T = {
   debug: false,
   steps: [],
   track: function (args) {
      if (!T.debug) return;
      var a = args[0];
      var d = args[1];
      var e = args[2];
      var step = {};
      var slot = G.event.getFriendEnemySlot(a, { attacker: a, defenser: d });
      step.a = a;
      step.d = d;
      step.f = slot.f.map(function (x) { return x.clone(); });
      step.e = slot.e.map(function (x) { return x.clone(); });
      step.pointer = [ G.event.slots.first[slot.cur], G.event.slots.first[slot.ecur] ];
      if (e) step.extra = e;
      T.steps.push(step);
   }
};

var G = {
   pool: {},
   sandbox: function (slot1, slot2) {
      slot1 = slot1.map(function (x) { return x.clone(); });
      slot2 = slot2.map(function (x) { return x.clone(); });
      var slots = [slot1, slot2], cur;
      // 1 2 3 4 5 6 7
      //     ^----- firstM
      // 3 4 5 6 7 1 2 for visualization and deathrattle trigger order
      // next 1 will start to attack
      var firstM = [0, 0];
      if (slot1.length > slot2.length) {
         cur = 0;
      } else if (slot2.length > slot1.length) {
         cur = 1;
      } else {
         cur = ~~(Math.random() * slots.length);
      }
      G.event.slots = {
         cur: cur,
         minions: slots,
         first: firstM
      };
      if (T.debug) { T.steps = []; } // debug
      G.event.initMinions(slot1);
      G.event.initMinions(slot2);
      G.event.triggerStart();
      while (!G.event.isBattleOver()) {
         G.event.slots.cur = cur;
         var ecur = (cur + 1) % 2;
         var friends = slots[cur];
         var enemies = slots[ecur];
         var scur = G.event.getNextAttacker(friends);
         if (scur >= 0) {
            var slotn = friends.length;
            if (slotn) {
               firstM[cur] = (firstM[cur] - scur % slotn) % slotn;
            } else {
               firstM[cur] = 0;
            }
            if (firstM[cur] < 0) firstM[cur] += slotn;
            var ma = friends[0];
            var md = G.event.getDefenser(ma, enemies);
            T.track([ma.clone(), md.clone()]); // debug
            ma.attack(md);
            if (ma.hp > 0 && !ma.flags.dead) {
               friends.push(friends.shift());
               firstM[cur] --;
               if (firstM[cur] < 0) firstM[cur] += friends.length;
            } else {
               if (firstM[cur] > 0) firstM[cur] --;
               friends.shift();
            }
            if (md.hp <= 0) {
               var mdcur = enemies.indexOf(md);
               enemies.splice(mdcur, 1);
               if (mdcur < firstM[ecur]) {
                  firstM[ecur] --;
               }
            }
         }
         cur = (cur + 1) % 2;
      }
      G.event.slots = null;
      while (firstM[0] > 0) {
         var m = slots[0].shift();
         slots[0].push(m);
         firstM[0] --;
      }
      while (firstM[1] > 0) {
         var m = slots[1].shift();
         slots[1].push(m);
         firstM[1] --;
      }
      return slots;
   },
   event: {
      slots: null,
      isBattleOver: function () {
         if (!G.event.slots) return true;
         var slot1 = G.event.slots.minions[0];
         var slot2 = G.event.slots.minions[1];
         if (!slot1 || !slot2) return true;
         var over = true;
         if (slot1.length > 0) {
            over = over && slot1.map(function (x) {
               return x.atk === 0;
            }).reduce(function (x, y) {
               return x && y;
            });
         }
         if (slot2.length > 0) {
            over = over || slot2.map(function (x) {
               return x.atk === 0;
            }).reduce(function (x, y) {
               return x && y;
            });
         } else {
            over = true;
         }
         return over;
      },
      getNextAttacker: function (slot) {
         var noatk = [];
         var m = slot.shift();
         var offset = 0;
         while (m.flags.noatk || m.atk === 0) {
            noatk.push(m);
            slot.push(m);
            offset ++;
            m = slot.shift();
            if (noatk.indexOf(m) >= 0) {
               slot.unshift(m);
               return -1;
            }
         }
         slot.unshift(m);
         return offset;
      },
      getDefenser: function (attacker, enemies) {
         var available = enemies.filter(function (x) {
            return x.hp > 0 && !x.flags.dead;
         });
         // if attacker = 612 (7 10), attack min.atk enemy
         if (attacker.flags.atk === 'min') {
            var atksort = available.slice().sort(function (x, y) {
               return x.atk - y.atk;
            });
            var minatk = atksort.filter(function (x) {
               return x.atk === atksort[0].atk;
            });
            return randomPick(minatk);
         }

         var taunts = available.filter(function (x) { return x.flags.taunt; });
         if (taunts.length) {
            return randomPick(taunts);
         }
         return randomPick(available);
      },
      getRandomMinion: function (slot) {
         var minions = slot.filter(function (x) {
            return x.hp > 0;
         });
         return randomPick(minions);
      },
      getFriendEnemySlot: function (m) {
         var friends, enemies;
         var result = {};
         var in0 = G.event.slots.minions[0];
         var in1 = G.event.slots.minions[1];
         if (in0.indexOf(m) >= 0) {
            friends = in0;
            enemies = in1;
            result.cur = 0;
            result.ecur = 1;
         } else {
            friends = in1;
            enemies = in0;
            result.cur = 1;
            result.ecur = 0;
         }
         result.f = friends;
         result.e = enemies;
         return result;
      },
      orderMinions: function (list, firstM) {
         list.forEach(function (x, i) {
            x.__order = i;
         });
         list = list.sort(function (x, y) {
            x = x.__order;
            y = y.__order;
            if (x < firstM && y < firstM) {
               return x - y;
            } else if (x >= firstM && y >= firstM) {
               return x - y;
            } else if (x < firstM && y >= firstM) {
               return 1;
            } else if (x >= firstM && y < firstM) {
               return -1;
            }
            return 0;
         });
         list.forEach(function (x, i) {
            delete x.__order;
         });
         return list;
      },
      delMinion: function (m, env) {
         var slot = G.event.getFriendEnemySlot(m, env);
         var p = slot.f.indexOf(m);
         var firstM = G.event.slots.first[slot.cur];
         if (p < firstM) G.event.slots.first[slot.cur] --;
         slot.f.splice(p, 1);
      },
      addMinion: function (queue, slot, index) {
         var cur = G.event.slots.minions[0] === slot?0:1;
         var firstM = G.event.slots.first[cur];
         var available = 7 - slot.filter(function (x) { return x.hp > 0 && !x.flags.dead; }).length;
         var n = available < queue.length?available:queue.length;
         if (index < firstM) firstM += n;
         slot.splice(index, 0, ...queue.slice(0, n));
         return n;
      },
      initMinions: function (slot) {},
      triggerStart: function () {},
      triggerPreAttack: function (m, env) {},
      triggerAttack: function (m, env) {},
      triggerDefense: function (m, env) {},
      triggerOutOfShield: function (m, env) {},
      triggerDamaged: function (m, env) {},
      triggerDead: function (m, env) {},
      triggerPostAttack: function (m, env) {},
   }
};

function Version20200728 () {
   var api = {};
   G.type = {
      0: '-',
      1: 'beast',
      2: 'mech',
      3: 'murloc',
      4: 'demon',
      5: 'dragon',
      6: 'pirate',
      99: '*'
   };
   G.pool = [
      // Tier 1
      new Minion(101, 1, 1, 1, {}, 'alleycat'),
      new Minion(102, 2, 2, 6, {}, 'deck swabbie'),
      new Minion(103, 2, 3, 5, { taunt: true }, 'dragonspawn lieutenant'),
      new Minion(104, 2, 1, 4, {}, 'fiendish servant'),
      new Minion(105, 1, 1, 2, {}, 'mecharoo'),
      new Minion(106, 1, 2, 2, {}, 'micro machine'),
      new Minion(107, 1, 2, 3, {}, 'murloc tidecaller'),
      new Minion(108, 2, 1, 3, {}, 'murloc tidehunter'),
      new Minion(109, 1, 2, 5, {}, 'red whelp'),
      new Minion(110, 1, 1, 0, { taunt: true, shield: true }, 'righteous protector'),
      new Minion(111, 2, 3, 3, {}, 'rockpool hunter'),
      new Minion(112, 2, 1, 6, {}, 'scallywag'),
      new Minion(113, 2, 2, 1, {}, 'scaveging hyena'),
      new Minion(114, 2, 1, 0, {}, 'selfless hero'),
      new Minion(115, 2, 4, 4, {}, 'vulgar homunculus'),
      new Minion(116, 1, 1, 0, {}, 'wrath waver'),
      // Tier 2
      new Minion(201, 2, 2, 0, { noatk: true }, 'arcane cannon'),
      new Minion(202, 3, 3, 6, {}, 'freedealing gambler'),
      new Minion(203, 2, 4, 5, {}, 'glyph guardian'),
      new Minion(204, 2, 3, 2, {}, 'harvest golem'),
      new Minion(205, 3, 3, 4, { taunt: true }, 'imprisoner'),
      new Minion(206, 2, 2, 2, {}, 'kaboom bot'),
      new Minion(207, 1, 1, 1, {}, 'kindly grandmother'),
      new Minion(208, 3, 3, 2, {}, 'metaltooth leaper'),
      new Minion(209, 3, 3, 3, {}, 'murloc warleader'),
      new Minion(210, 2, 3, 4, {}, 'nathrezim overseer'),
      new Minion(211, 2, 4, 3, {}, 'old murk-eye'),
      new Minion(212, 1, 1, 2, {}, 'pogo-hopper'),
      new Minion(213, 3, 2, 1, {}, 'rabid saurolisk'),
      new Minion(214, 2, 2, 1, {}, 'rat pack'),
      new Minion(215, 3, 3, 6, {}, 'southsea captain'),
      new Minion(216, 2, 2, 0, {}, 'spawn of n\'zoth'),
      new Minion(217, 3, 4, 5, {}, 'steward of time'),
      new Minion(218, 1, 3, 0, { taunt: true }, 'unstable ghoul'),
      new Minion(219, 1, 2, 0, {}, 'waxrider togwaggle'),
      new Minion(220, 3, 3, 2, {}, 'zoobot'),
      // Tier 3
      new Minion(301, 4, 2, 6, {}, 'bloodsail cannoneer'),
      new Minion(302, 2, 1, 5, { shield: true, reborn: true }, 'bronze warden'),
      new Minion(303, 2, 3, 3, {}, 'coldlight seer'),
      new Minion(304, 4, 4, 0, {}, 'crowd favorite'),
      new Minion(305, 5, 4, 0, {}, 'crystalweaver'),
      new Minion(306, 3, 2, 2, { shield: true }, 'deflect-o-bot'),
      new Minion(307, 4, 4, 3, {}, 'felfin navigator'),
      new Minion(308, 4, 4, 5, {}, 'hangry dragon'),
      new Minion(309, 4, 3, 0, {}, 'houndmaster'),
      new Minion(310, 2, 4, 4, {}, 'imp gang boss'),
      new Minion(311, 3, 3, 1, {}, 'infested wolf'),
      new Minion(312, 2, 2, 0, {}, 'khadgar'),
      new Minion(313, 3, 2, 1, {}, 'monstrous macaw'),
      new Minion(314, 3, 3, 0, {}, 'pack leader'),
      new Minion(315, 4, 3, 2, {}, 'piloted shredder'),
      new Minion(316, 3, 1, 2, {}, 'replicating menace'),
      new Minion(317, 3, 3, 6, {}, 'salty looter'),
      new Minion(318, 2, 5, 2, {}, 'screwjank clunker'),
      new Minion(319, 1, 1, 0, {}, 'shifter zerus'),
      new Minion(320, 3, 3, 0, {}, 'soul juggler'),
      new Minion(321, 9, 7, 1, {}, 'the beast'),
      new Minion(322, 4, 4, 5, { taunt: true }, 'twilight emissary'),
      new Minion(323, 2, 8, 6, { taunt: true }, 'yo-ho-ogre'),
      // Tier 4
      new Minion(401, 2, 4, 2, { taunt: true, shield: true }, 'annoy-o-module'),
      new Minion(402, 1, 7, 0, { shield: true }, 'bolvar, fireblood'),
      new Minion(403, 2, 4, 1, {}, 'cave hydra'),
      new Minion(404, 5, 5, 5, {}, 'cobalt scalebane'),
      new Minion(405, 2, 3, 0, {}, 'defender of argus'),
      new Minion(406, 3, 6, 5, {}, 'drakonid enforcer'),
      new Minion(407, 4, 4, 4, {}, 'floating watcher'),
      new Minion(408, 4, 4, 6, {}, 'goldgrubber'),
      new Minion(409, 5, 6, 5, {}, 'herald of flame'),
      new Minion(410, 2, 2, 2, {}, 'iron sesei'),
      new Minion(411, 0, 5, 2, {}, 'mechano-egg'),
      new Minion(412, 4, 4, 0, {}, 'menagerie magician'),
      new Minion(413, 3, 4, 6, {}, 'ripsnarl captain'),
      new Minion(414, 6, 5, 1, {}, 'savannah highmane'),
      new Minion(415, 2, 6, 2, {}, 'security rover'),
      new Minion(416, 5, 8, 4, { taunt: true }, 'siegebreaker'),
      new Minion(417, 5, 4, 6, {}, 'southsea strongarm'),
      new Minion(418, 1, 2, 3, {}, 'toxfin'),
      new Minion(419, 4, 5, 0, {}, 'virmen sensei'),
      // Tier 5
      new Minion(501, 3, 1, 4, {}, 'annihilan battlemaster'),
      new Minion(502, 1, 7, 0, {}, 'baron rivendare'),
      new Minion(503, 2, 4, 0, {}, 'brann bronzebeard'),
      new Minion(504, 6, 6, 6, {}, 'cap\'n hoggarr'),
      new Minion(506, 7, 7, 1, {}, 'ironhide direhorn'),
      new Minion(507, 1, 5, 2, {}, 'junkbot'),
      new Minion(508, 6, 3, 3, {}, 'king bagurgle'),
      new Minion(509, 2, 2, 0, {}, 'lightfang enforcer'),
      new Minion(510, 9, 7, 4, {}, 'mal\'ganis'),
      new Minion(511, 5, 5, 5, {}, 'murozond'),
      new Minion(512, 8, 5, 6, {}, 'nat pagle, extreme angler'),
      new Minion(513, 3, 2, 3, {}, 'primalfin lookout'),
      new Minion(514, 2, 4, 5, {}, 'razorgore, the untamed'),
      new Minion(515, 6, 7, 6, { windfury: true }, 'seabreaker goliath'),
      new Minion(516, 5, 7, 2, {}, 'sneed\'s old shredder'),
      new Minion(517, 2, 3, 0, {}, 'strongshell scavenger'),
      new Minion(518, 3, 9, 4, { taunt: true }, 'voidlord'),
      // Tier 6
      new Minion(601, 6, 7, 6, {}, 'dread admiral eliza'),
      new Minion(602, 6, 9, 2, {}, 'foe reaper 4000'),
      new Minion(603, 5, 4, 1, {}, 'gentle megasaur'),
      new Minion(604, 7, 7, 2, {}, 'ghastcoiler'),
      new Minion(605, 6, 10, 4, {}, 'imp mama'),
      new Minion(606, 4, 12, 5, {}, 'kalecgos, arcane aspeet'),
      new Minion(607, 3, 6, 0, {}, 'kangor\'s apprentiee'),
      new Minion(608, 2, 8, 1, { poison: true }, 'maexxna'),
      new Minion(609, 5, 5, 1, {}, 'mama bear'),
      new Minion(610, 7, 4, 0, {}, 'nadina the red'),
      new Minion(611, 6, 4, 0, {}, 'the tide razor'),
      new Minion(612, 7, 10, 0, { windfury: true, atk: 'min' }, 'zapp slywick'),
      new Minion(613, 4, 4, 1, {}, 'goldrinn, the great wolf'), // move goldrinn to Tier 6
      new Minion(614, 6, 6, 99, {}, 'amalgadon'),
      // Unpurchsable
      new Minion(1, 3, 2, 1, {}, 'big bad wolf'),
      new Minion(2, 2, 1, 2, {}, 'damaged golem'),
      new Minion(3, 3, 3, 0, {}, 'finkle einhorn'),
      new Minion(4, 2, 3, 2, { taunt: true }, 'guard bot'),
      new Minion(5, 2, 2, 1, {}, 'hyena'),
      new Minion(6, 1, 1, 4, {}, 'imp'),
      new Minion(7, 5, 5, 1, {}, 'ironhide runt'),
      new Minion(8, 1, 1, 2, {}, 'jo-e bot'),
      new Minion(9, 1, 1, 2, {}, 'microbot'),
      new Minion(10, 1, 1, 3, {}, 'murloc scout'),
      new Minion(11, 1, 1, 0, {}, 'plant'),
      new Minion(12, 1, 1, 1, {}, 'rat'),
      new Minion(13, 8, 9, 2, {}, 'robosaur'),
      new Minion(14, 1, 1, 6, {}, 'sky pirate'),
      new Minion(15, 1, 1, 1, {}, 'spider'),
      new Minion(16, 1, 1, 1, {}, 'tabbycat'),
      new Minion(17, 0, 2, 0, {}, 'treasure chest'),
      new Minion(18, 1, 3, 4, { taunt: true }, 'voidwalker'),
      new Minion(19, 1, 1, 99, {}, 'amalgam'),
      new Minion(20, 2, 3, 1, { poison: true }, 'emperor cobra'),
      new Minion(21, 1, 1, 1, {}, 'snake'),
      // functions
      new Minion(-4, 2, 1, 0, { immune: true, dead: true }, 'arcane cannon # shot'),
      new Minion(-3, 3, 1, 0, { immune: true, dead: true }, 'soul juggler # spell'),
      new Minion(-2, 3, 1, 5, { immune: true, dead: true }, 'herald of flame # overkill'),
      new Minion(-1, 0, 0, 0, {}, '#seeds') // summon 2 (plant)s
   ];
   var constants = {
      deathrattle: [
         104, 105, 112, 114, 204, 205, 206, 207, 214,
         216, 218, 311, 315, 316, 321, 411, 414, 613,
         508, 516, 518, 604, 607, 610, 611
      ], // for ghastcoiler
      orange: [
         211, 219, 312, 319, 321, 402, 502, 503, 504,
         613, 508, 510, 511, 512, 514, 601, 602, 606,
         608, 610, 612
      ], // sneed\'s old shredder
      junior: [103, 106, 108, 111, 113, 115, 207, 218, 312], // for piloted shredder
      pirate: G.pool.filter(function (m) {
         return (m.type === 6 || m.type === 99) && m.id > 100;
      }).map(function (m) {
         return m.id;
      }), // for the tide razor
      demon: G.pool.filter(function (m) {
         return (m.type === 4 || m.type === 99) && m.id > 100 && m.id !== 605;
      }).map(function (m) {
         return m.id;
      }), // for imp mama
      all: G.pool.filter(function (m) {
         return m.id > 100;
      }).map(function (m) {
         return m.id;
      }) // for treasure chest
   };

   var helper = {
      shieldM306: function (slot, n) {
         if (n === 0) return;
         var m306s = slot.filter(function (x) {
            if (x.flags.dead) return;
            return x.id === 306;
         });
         m306s.forEach(function (x) {
            x.atk += n;
            if (x.flags.tri) {
               x.atk += n;
            }
            x.flags.shield = true;
         });
      },
      buffM107: function (slot, n) {
         if (n === 0) return;
         var m107s = slot.filter(function (x) {
            if (x.flags.dead) return;
            return x.id === 107;
         });
         m107s.forEach(function (x) {
            x.atk += n;
            if (x.flags.tri) {
               x.atk += n;
            }
         });
      },
      newBuffMinions: function (slot, added) {
         added.forEach(function (source) {
            switch (source.id) {
               case 215: // southsea captain
                  slot.forEach(function (m) {
                     if (m === source) return;
                     if (m.type !== 6) return;
                     var val = source.flags.tri?2:1;
                     m.atk += val;
                     m.hp += val;
                  });
                  break;
               case 416: // siegebreaker
                  slot.forEach(function (m) {
                     if (m === source) return;
                     if (m.type !== 4) return;
                     var val = source.flags.tri?2:1;
                     m.atk += val;
                  });
                  break;
               case 510: // mal\'ganis
                  slot.forEach(function (m) {
                     if (m === source) return;
                     if (m.type !== 4) return;
                     var val = source.flags.tri?4:2;
                     m.atk += val;
                     m.hp += val;
                  });
                  break;
            }
         });
      },
      countM312: function (slot) {
         var m312s = slot.filter(function (x) {
            if (x.flags.dead) return false;
            if (x.hp <= 0) return false;
            return x.id === 312;
         });
         var m312 = 0;
         if (m312s.length) m312 = m312s.map(function (x) { return x.flags.tri?2:1; }).reduce(function (x, y) { return x+y; });
         return m312;
      },
      countM602: function (slot) {
         var m602s = slot.filter(function (x) {
            if (x.flags.dead) return false;
            if (x.hp <= 0) return false;
            return x.id === 602;
         });
         var m602 = 1;
         if (m602s.length) m602 = m602s.map(function (x) { return x.flags.tri?3:2; }).reduce(function (x, y) { return x>y?x:y; });
         return m602;
      },
      countBeastSummonBuff: function (slot, buff) {
         // x 314 pack leader
         // x 609 mama bear
         var m314s = slot.filter(function (x) {
            if (x.hp <= 0) return false;
            if (x.flags.dead) return false;
            return x.id === 314;
         });
         if (m314s.length > 0) {
            buff.m314 = m314s.map(function (x) { return x.flags.tri ? 2 : 1; }).reduce(function (x, y) { return x + y; });
         }
         var m609s = slot.filter(function (x) {
            if (x.hp <= 0) return false;
            if (x.flags.dead) return false;
            return x.id === 609;
         });
         if (m609s.length > 0) {
            buff.m609 = m609s.map(function (x) { return x.flags.tri ? 2 : 1; }).reduce(function (x, y) { return x + y; });
         }
         buff.beast = true;
         return buff;
      },
      countDemonSummonBuff: function (slot, buff) {
         // x 416 siegebreaker
         // x 510 mal\'ganis
         var m416s = slot.filter(function (x) {
            if (x.hp <= 0) return false;
            if (x.flags.dead) return false;
            return x.id === 416;
         });
         if (m416s.length > 0) {
            buff.m416 = m416s.map(function (x) { return x.flags.tri ? 2 : 1; }).reduce(function (x, y) { return x + y; });
         }
         var m510s = slot.filter(function (x) {
            if (x.hp <= 0) return false;
            if (x.flags.dead) return false;
            return x.id === 510;
         });
         if (m510s.length > 0) {
            buff.m510 = m510s.map(function (x) { return x.flags.tri ? 2 : 1; }).reduce(function (x, y) { return x + y; });
         }
         buff.demon = true;
         return buff;
      },
      countPirateSummonBuff: function (slot, buff) {
         // x 215 southsea captain
         var m215s = slot.filter(function (x) {
            if (x.hp <= 0) return false;
            if (x.flags.dead) return false;
            return x.id === 215;
         });
         if (m215s.length > 0) {
            buff.m215 = m215s.map(function (x) { return x.flags.tri ? 2 : 1; }).reduce(function (x, y) { return x + y; });
         }
         buff.pirate = true;
         return buff;
      },
      countMurlocSummonBuff: function (slot, buff) {
         // x 209 murloc warleader
         var m209s = slot.filter(function (x) {
            if (x.hp <= 0) return false;
            if (x.flags.dead) return false;
            return x.id === 209;
         });
         if (m209s.length > 0) {
            buff.m209 = m209s.map(function (x) { return x.flags.tri ? 2 : 1; }).reduce(function (x, y) { return x + y; });
         }
         buff.murloc = true;
         return buff;
      },
      summonBeastBuff: function (m, slot, buff) {
         if (m.type === 1 || m.type === 99) { // beast
            if (!buff.beast) helper.countBeastSummonBuff(slot, buff);
            m.atk += (buff.m314 || 0) * 3 + (buff.m609 || 0) * 5;
            m.hp += (buff.m609 || 0) * 5;
         }
      },
      summonDemonBuff: function (m, slot, buff) {
         if (m.type === 4 || m.type === 99) {
            if (!buff.demon) helper.countDemonSummonBuff(slot, buff);
            m.atk += (buff.m416 || 0) + (buff.m510 || 0) * 2;
            m.hp += (buff.m510 || 0) * 2;
         }
      },
      summonPirateBuff: function (m, slot, buff) {
         if (m.type === 6 || m.type === 99) {
            if (!buff.pirate) helper.countPirateSummonBuff(slot, buff);
            m.atk += (buff.m215 || 0);
            m.hp += (buff.m215 || 0);
         }
      },
      summonMurlocBuff: function (m, slot, buff) {
         if (m.type === 3 || m.type === 99) {
            if (!buff.murloc) helper.countMurlocSummonBuff(slot, buff);
            m.atk += (buff.m209 || 0) * 2;
         }
      },
      getLeftMinion: function (m, slot) {
         var cur = G.event.slots.minions[0]===slot?0:1;
         var first = G.event.slots.first[cur] || 0;
         var index = slot.indexOf(m);
         if (index === first) return null;
         while (true) {
            index --;
            if (index < 0) index += slot.length;
            if (index === first) return null;
            var mf = slot[index];
            if (mf.hp > 0) return mf;
         }
      },
      getRightMinion: function (m, slot) {
         var cur = G.event.slots.minions[0]===slot?0:1;
         var first = G.event.slots.first[cur] || 0;
         var index = slot.indexOf(m);
         while (true) {
            index = (index + 1) % slot.length;
            if (index === first) return null;
            var mf = slot[index];
            if (mf.hp > 0) return mf;
         }
      }
   };

   G.event.initMinions = function (slot) {
      var buff = {};
      // x 209 murloc warleader
      helper.countMurlocSummonBuff(slot, buff);
      slot.forEach(function (x) {
         if (x.type !== 3) return; // murloc
         helper.summonMurlocBuff(x, slot, buff);
         if (x.id === 209) {
            var val = 2 * (x.flags.tri?2:1);
            x.atk -= val;
         }
      });

      // x 215 southsea captain
      helper.countPirateSummonBuff(slot, buff);
      slot.forEach(function (x) {
         if (x.type !== 6) return; // pirate
         helper.summonPirateBuff(x, slot, buff);
         if (x.id === 215) {
            var val = x.flags.tri?2:1;
            x.atk -= val;
            x.hp -= val;
         }
      });

      // x 416 siegebreaker
      // x 510 mal\'ganis
      helper.countDemonSummonBuff(slot, buff);
      slot.forEach(function (x) {
         if (x.type !== 4) return; // demon
         helper.summonDemonBuff(x, slot, buff);
         if (x.id === 416) {
            var val = x.flags.tri?2:1;
            x.atk -= val;
         } else if (x.id === 510) {
            var val = 2 * (x.flags.tri?2:1);
            x.atk -= val;
            x.hp -= val;
         }
      });
   };

   G.event.triggerStart = function () {
      // x 109 red welp
      var slot1 = G.event.slots.minions[0];
      var slot2 = G.event.slots.minions[1];
      var order = shuffle([{f: slot1, e: slot2}, {f: slot2, e: slot1}]);
      order.forEach(function (slot) {
         var m109s = slot.f.filter(function (m) { return m.id === 109 });
         var damage = slot.f.filter(function (m) { return m.type === 5; }).length;
         var barrier = new Minion(-99, 0, 1, 0, { dead: true });
         var virtual = new Minion(-99, damage, 0, 5, { immune: true, dead: true });
         slot.f.push(barrier);
         slot.f.push(virtual);
         slot.f.push(barrier);
         m109s.forEach(function (m) {
            var n = m.flags.tri?2:1;
            for (var i = 0; i < n; i++) {
               var md = randomPick(slot.e.filter(function (m) { return m.hp > 0; }));
               if (!md) return;
               T.track([m.clone(), md.clone(), damage]); // debug
               virtual.attack(md);
               if (md.hp <= 0) {
                  md.flags.dead = true;
                  G.event.delMinion(md, { attacker: m, defenser: md });
               }
            }
         });
         slot.f.pop();
         slot.f.pop();
         slot.f.pop();
      });
   };

   G.event.triggerPreAttack = function (m, env) {
      var slot = G.event.getFriendEnemySlot(m, env);
 
      // x 203 glyph guardian
      if (m.id === 203) {
         if (m.flags.tri) {
            m.atk *= 3;
         } else {
            m.atk *= 2;
         }
      }

      // x 413 ripsnarl captain
      // x 601 dread admiral eliza
      if (m.type === 6) {
         var times = 0;
         var m413s = slot.f.filter(function (x) {
            return x.id === 413;
         });
         m413s.forEach(function (x) {
            if (x === m) return;
            times ++;
            if (x.flags.tri) times ++;
         });
         if (times > 0) {
            m.hp += times * 2;
            m.atk += times * 2;
         }

         times = 0;
         var m601s = slot.f.filter(function (x) {
            return x.id === 601;
         });
         m601s.forEach(function (x) {
            times ++;
            if (x.flags.tri) times ++;
         });
         if (times > 0) {
            slot.f.forEach(function (x) {
               x.hp += times;
               x.atk += times;
            });
         }
      }
   };
   G.event.triggerAttack = function (m, env) {
      var slot = G.event.getFriendEnemySlot(m, env);
      // x 313 monstrous macaw
      if (m.id === 313) {
         var available = slot.f.filter(function (x) {
            if (constants.deathrattle.indexOf(x.id) >= 0) return true;
            if (x.flags.deathrattle && x.flags.deathrattle.length > 0) return true;
            return false;
         });
         var target = randomPick(available);
         var subenv = { attacker: slot.e[0], defense: target };
         G.event.triggerDead(target, subenv, true);
      }

      // x 219 waxrider togwaggle
      if (m.type === 5) {
         if (env.defenser.hp <= 0) {
            var m219s = slot.f.filter(function (x) {
               return x.id === 219;
            });
            m219s.forEach(function (x) {
               x.hp += 2;
               x.atk += 2;
               if (x.flags.tri) {
                  x.hp += 2;
                  x.atk += 2;
               }
            });
         }
      }

      var left, right;
      {
         left = helper.getLeftMinion(m, slot.f);
         right = helper.getRightMinion(m, slot.f);
      }
      var eleft, eright;
      {
         eleft = helper.getLeftMinion(env.defenser, slot.e);
         eright = helper.getRightMinion(env.defenser, slot.e);
      }

      // x 403 cave hydra
      // x 602 foe reaper 4000
      if (m.id === 403 || m.id === 602) {
         // assume m.atk > 0 here
         if (eleft || eright) env.moreDamaged = [null, null];
         if (eleft) {
            T.track([m.clone(), eleft.clone(), 'left']); // debug
            env.moreDamaged[0] = eleft;
            if (eleft.flags.shield) {
               eleft.flags.shield = false;
               G.event.triggerOutOfShield(eleft, env);
            } else {
               eleft.hp -= m.atk;
            }
         }
         if (eright) {
            T.track([m.clone(), eright.clone(), 'right']); // debug
            env.moreDamaged[1] = eright;
            if (eright.flags.shield) {
               eright.flags.shield = false;
               G.event.triggerOutOfShield(eright, env);
            } else {
               eright.hp -= m.atk;
            }
         }
      }

      // x 201 arcane cannon
      {
         var shots = [];
         if (left && left.id === 201) shots.push(left);
         if (right && right.id === 201) shots.push(right);
         shots.forEach(function (cannon) {
            // e.g. cannon | attacker | cannon | barrier | vritual
            //                              ^------x-------/
            var barrier = new Minion(-99, 0, 1, 0, { dead: true });
            var virtual = api.newMinionById(-4, false);
            slot.f.push(barrier);
            slot.f.push(virtual);
            slot.f.push(barrier);
            var attacked = [];
            var n = cannon.flags.tri?2:1;
            for (var i = 0; i < n; i++) {
               var available = slot.e.filter(function (x) {
                  return x.hp > 0;
               });
               var md = randomPick(available);
               if (!md) break;
               md.hp -= virtual.atk;
               attacked.push(md);
            }
            var efirst = G.event.slots.first[slot.ecur];
            var enemies = G.event.orderMinions(slot.e.slice(), efirst);
            if (attacked.length > 0) {
               attacked.forEach(function (me) {
                  me.hp += virtual.atk;
                  me.__order = enemies.indexOf(me);
               });
               attacked = attacked.sort(function (x, y) {
                  return x.__order - y.__order;
               });
            }
            attacked.forEach(function (md) {
               delete md.__order;
               var denv = { attacker: virtual, defenser: md };
               T.track([cannon.clone(), md.clone(), virtual.atk]); // debug
               virtual.attack(md);
               if (md.hp <= 0 && env.defenser !== md) {
                  G.event.delMinion(md, denv);
               }
            });
            slot.f.pop();
            slot.f.pop();
            slot.f.pop();
         });
      }
   };
   G.event.triggerDefense = function (m, env) {
      var slot = G.event.getFriendEnemySlot(m, env);
      // x 323 yo-ho-ogre and should be real attack instead of merely damage
      if (m.id === 323 && env.attacker.id > 0) {
         var md = G.event.getDefenser(m, slot.e);
         var denv = { attacker: m, defenser: md };
         T.track([m.clone(), md.clone()]); // debug
         m.attack(md);
         if (md.hp <= 0 && env.attacker !== md) {
            G.event.delMinion(md, denv);
         }
      }
   };
   G.event.triggerOutShield = function (m, env) {
      // x 402 bolvar, fireblood
      // x 406 drakonid enforcer
      var slot = G.event.getFriendEnemySlot(m, env);
      slot.f.forEach(function (x) {
         if (x.flags.dead) return;
         if (x.hp <= 0) return;
         if (x.id !== 402) return;
         x.atk += 2;
         if (x.flags.tri) {
            x.atk += 2;
         }
      });
      slot.f.filter(function (x) {
         if (x.flags.dead) return;
         if (x.hp <= 0) return;
         if (x.id !== 406) return;
         x.atk += 2;
         x.hp += 2;
         if (x.flags.tri) {
            x.atk += 2;
            x.hp += 2;
         }
      });
   };
   G.event.triggerDamaged = function (m, env) {
      if (m.id !== 310 && m.id !== 415 && m.id !== 605) return;
      var slot = G.event.getFriendEnemySlot(m, env);
      var m312 = helper.countM312(slot.f);

      // x 310 imp gang boss
      if (m.id === 310) {
         var buff = {};
         var queue = [];
         var n = 1 + m312;
         var template = api.newMinionById(6, m.flags.tri);
         for (var i = 0; i < n; i++) {
            var summon = template.clone();
            helper.summonDemonBuff(summon, slot.f, buff);
            queue.push(summon);
         }
         G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
      }

      // x 415 security rover
      if (m.id === 415) {
         var queue = [];
         var n = 1 + m312;
         var template = api.newMinionById(4, m.flags.tri);
         for (var i = 0; i < n; i++) {
            var summon = template.clone();
            queue.push(summon);
         }
         n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
         helper.shieldM306(slot.f, n);
      }

      // x 605 imp mama
      if (m.id === 605) {
         var queue = [];
         var n = m.flags.tri?2:1;
         for (var i = 0; i < n && queue.length <= 7; i++) {
            var buff = {};
            var sid = randomPick(constants.demon);
            var summon = api.newMinionById(sid, false);
            summon.flags.taunt = true;
            helper.summonBeastBuff(summon, slot.f, buff);
            queue.push(summon);
            for (var j = m312; j > 0 && queue.length <= 7; j--) {
               var copy = summon.clone();
               helper.summonBeastBuff(copy, slot.f, buff);
               helper.summonDemonBuff(copy, slot.f, buff);
               helper.summonPirateBuff(copy, slot.f, buff);
               queue.push(copy);
            }
            helper.summonDemonBuff(summon, slot.f, buff);
            helper.summonPirateBuff(summon, slot.f, buff);
         }
         n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
         var added = queue.slice(0, n);
         var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; });
         var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; });
         helper.shieldM306(slot.f, mechn);
         helper.buffM107(slot.f, murlocn);
         helper.newBuffMinions(slot.f, added);
      }
   };
   G.event.triggerDead = function (m, env, skipDeadBuff) {
      var slot = G.event.getFriendEnemySlot(m, env);
      var m602 = helper.countM602(slot.f);
      var m312 = helper.countM312(slot.f);

      if (m.flags.deathrattle) {
         var cur = G.event.slots.minions[0] === slot.f?0:1;
         var firstM = G.event.slots.first[cur];
         var n = m.flags.deathrattle.length;
         if (n > 0) {
            slot.f.splice(firstM + 1, 0, ...m.flags.deathrattle);
         }
      }
      processOne(m, env);
      if (m.flags.deathrattle) {
         m.flags.deathrattle.forEach(function (deathrattle) {
            // deathrattle -> Minion
            deathrattle.hp = 0;
            deathrattle.flags.dead = true;
            processOne(deathrattle, env);
            var index = slot.f.indexOf(deathrattle);
            slot.f.splice(index, 1);
         });
      }
      if (!skipDeadBuff) {
         deadBuff(m, env);
      }

      function deadBuff(m, env) {
         // x 113 scaveging hyena
         if (m.type === 1) { // beast
            var m113s = slot.f.filter(function (x) {
               return x.id === 113;
            });
            m113s.forEach(function (x) {
               if (x === m) return;
               x.hp += 1;
               x.atk += 2;
               if (x.flags.tri) {
                  x.hp += 1;
                  x.atk += 2;
               }
            });
         }

         // x 507 junkbot
         // x 607 kangor\'s apprentiee
         if (m.type === 2) { // mech
            var m507s = slot.f.filter(function (x) {
               return x.id === 507;
            });
            m507s.forEach(function (x) {
               if (x === m) return;
               x.hp += 2;
               x.atk += 2;
               if (x.flags.tri) {
                  x.hp += 2;
                  x.atk += 2;
               }
            });
            var m607s = slot.f.filter(function x() {
               return x.id === 607;
            })
            m607s.forEach(function (x) {
               if (!x.flags.pool) x.flags.pool = [];
               if (x.flags.pool.length >= 2) return;
               x.flags.pool.push(m);
            });
         }
   
         // x 302 bronze warden
         if (m.id === 302 && m.flags.reborn) {
            var times = 1 + m312, i = 0, queue = [];
            for (i = 0; i < times; i++) {
               var m = api.newMinionById(302);
               m.flags.reborn = false;
               queue.push(m);
            }
            G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
         }

         // x 320 soul juggler
         if (m.type === 4) { // demon
            var m320s = slot.f.filter(function (mf) {
               return mf.id === 320;
            });
            var m320 = 0;
            if (m320s.length > 0) {
               m320 = m320s.map(function (mf) {
                  return mf.flags.tri?2:1;
               }).reduce(function (x, y) {
                  return x+y;
               });
            }
            if (m320 > 0) {
               var barrier = new Minion(-99, 0, 1, 0, { dead: true });
               var virtual = api.newMinionById(-3, false);
               slot.f.push(barrier);
               slot.f.push(virtual);
               slot.f.push(barrier);
               var attacked = [];
               for (var i = 0; i < m320; i++) {
                  var available = slot.e.filter(function (x) {
                     return x.hp > 0;
                  });
                  var md = randomPick(available);
                  if (!md) break;
                  md.hp -= virtual.atk;
                  attacked.push(md);
               }
               var efirst = G.event.slots.first[slot.ecur];
               var enemies = G.event.orderMinions(slot.e.slice(), efirst);
               if (attacked.length > 0) {
                  attacked.forEach(function (me) {
                     me.hp += virtual.atk;
                     me.__order = enemies.indexOf(me);
                  });
                  attacked = attacked.sort(function (x, y) {
                     return x.__order - y.__order;
                  });
               }
               attacked.forEach(function (md) {
                  delete md.__order;
                  var denv = { attacker: virtual, defenser: md };
                  T.track([m.clone(), md.clone(), virtual.atk]); // debug
                  virtual.attack(md);
                  if (md.hp <= 0 && env.defenser !== md && env.attacker !== md) {
                     G.event.delMinion(md, denv);
                  }
               });
               slot.f.pop();
               slot.f.pop();
               slot.f.pop();
            }
         }

         // x 209 murloc warleader
         if (m.id === 209) {
            var v = m.flags.tri?4:2;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 3) return; // murloc
               mf.atk -= v;
            });
         }

         // x 215 southsea captain
         if (m.id === 215) {
            var v = m.flags.tri?2:1;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 6) return; // pirate
               mf.atk -= v;
               mf.hp -= v;
               if (mf.hp < 0) mf.hp = 1;
            });
         }

         // x 416 siegebreaker
         if (m.id === 416) {
            var v = m.flags.tri?2:1;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 4) return; // demon
               mf.atk -= v;
            });
         }

         // x 510 mal\'ganis
         if (m.id === 510) {
            var v = m.flags.tri?4:2;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 4) return; // demon
               mf.atk -= v;
               mf.hp -= v;
               if (mf.hp < 0) mf.hp = 1;
            });
         }
      }

      function processOne(m, env) {
         var buff = {};

         // x 104 fiendish servant
         // x 105 mecharoo
         // x 112 scallywag
         // x 114 selfless hero
         // x 204 harvest golem
         // x 205 imprisoner
         // x 206 kaboom bot
         // x 207 kindly grandmother
         // x 214 rat pack
         // x 216 spawn of n\'zoth
         // x 218 unstable ghoul
         // x 311 infested wolf
         // x 315 piloted shredder
         // x 316 replicating menace
         // x 321 the beast
         // x 411 mechano-egg
         // x 414 savannah highmane
         // x 613 goldrinn, the great wolf
         // x 508 king bagurgle
         // x 516 sneed\'s old shredder
         // x 518 voidlord
         // x 604 ghastcoiler
         // x 607 kangor\'s apprentiee
         // x 610 nadina the red
         // x 611 the tide razor
         // x  17 treasure chest
         switch(m.id) {
            case 17: { // treasure chest
               var queue = [];
               for (var i = 0; i < m602 && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.all);
                  var summon = api.newMinionById(sid, true);
                  // TODO: if we summon 602 or 312, how to summon more minions?
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = m312; j > 0 && queue.length <= 7; j--) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     helper.summonMurlocBuff(copy, slot.f, buff);
                     helper.summonDemonBuff(copy, slot.f, buff);
                     helper.summonPirateBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
                  helper.summonMurlocBuff(summon, slot.f, buff);
                  helper.summonDemonBuff(summon, slot.f, buff);
                  helper.summonPirateBuff(summon, slot.f, buff);
               }
               var n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; });
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; });
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case -1: { // #seeds
               var queue = [];
               var n = m602 * (1 + m312);
               var template = api.newMinionById(11, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 104: { // fiendish servant
               var times = m602, i = 0;
               if (m.flags.tri) times *= 2;
               var targets = [];
               for (i = 0; i < times; i ++) {
                  var target = G.event.getRandomMinion(slot.f);
                  if (!target) break;
                  target.atk += m.atk;
               }
            } break;
            case 105: { // mecharoo
               var queue = [];
               var n = m602 * (1 + m312);
               var template = api.newMinionById(8, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 112: { // scallywag
               var queue = [];
               var template = api.newMinionById(14, m.flags.tri);
               var offset = 0;
               helper.summonPirateBuff(template, slot.f, buff);
               for (var i = 0; i < m602; i++) {
                  for (var j = -1; j < m312; j ++) {
                     queue.push(template);
                  }
                  // use offset:
                  // 1     instead of      1
                  // 1 2                   2 1
                  var n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + offset + 1);
                  offset += n;
                  queue.slice(0, n).forEach(function (mf) {
                     var md = G.event.getDefenser(mf, slot.e);
                     if (!md) return;
                     var denv = { attacker: mf, defenser: md };
                     T.track([mf.clone(), md.clone()]); // debug
                     mf.attack(md);
                     if (mf.hp <= 0) {
                        mf.flags.dead = true;
                        offset --;
                        G.event.delMinion(mf, denv);
                     }
                     if (md.hp <= 0 && env.defenser !== md && env.attacker !== md) {
                        md.flags.dead = true;
                        G.event.delMinion(md, denv);
                     }
                  });
               }
            } break;
            case 114: { // selfless hero
               var times = m602, i = 0;
               if (m.flags.tri) times *= 2;
               var targets = [];
               var available = slot.f.filter(function (x) {
                  if (x.hp <= 0) return false;
                  if (x.flags.dead) return false;
                  if (x.flags.shield) return false;
                  return true;
               });
               shuffle(available);
               times = available.length < times? available.length : times;
               for (i = 0; i < times; i ++) {
                  available[i].flags.shield = true;
               }
            } break;
            case 204: { // harvest golem
               var queue = [];
               var n = m602 * (1 + m312);
               var template = api.newMinionById(2, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 205: { // imprisoner
               var queue = [];
               var n = m602 * (1 + m312);
               var template = api.newMinionById(6, m.flags.tri);
               for (var i = 0; i < n; i++) {
                  var summon = template.clone();
                  helper.summonDemonBuff(summon, slot.f, buff);
                  queue.push(summon);
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 206: { // kaboom bot
               var times = m602, i = 0;
               if (m.flags.tri) times *= 2;
               var targets = [];
               for (i = 0; i < times; i ++) {
                  var target = G.event.getRandomMinion(slot.e);
                  if (!target) break;
                  targets.push(target);
               }
               if (targets.length) {
                  var firstM = G.event.slots.first[slot.ecur];
                  G.event.orderMinions(targets, firstM).forEach(function (target) {
                     var subenv = { attacker: m, defenser: target };
                     T.track([m.clone(), target.clone()]); // debug
                     if (target.flags.shield) {
                        target.flags.shield = false;
                        G.event.triggerOutOfShield(target, subenv);
                     } else {
                        target.hp -= 4;
                        G.event.triggerDamaged(target, subenv);
                        if (target.hp <= 0) {
                           G.event.triggerDead(target, subenv);
                           G.event.delMinion(target, subenv);
                        }
                     }
                  });
               }
            } break;
            case 207: { // kindly grandmother
               var queue = [];
               var template = api.newMinionById(1, m.flags.tri);
               for (var i = 0; i < m602 && queue.length <= 7; i++) {
                  var summon = template.clone();
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = 0; j < m312 && queue.length <= 7; j++) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 214: { // rat pack
               var queue = [];
               var template = api.newMinionById(12, m.flags.tri);
               var n = m602 * m.atk;
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var summon = template.clone();
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = 0; j < m312 && queue.length <= 7; j++) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 216: { // spawn of n\'zoth
               var times = m602;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  m.atk += times;
                  m.hp += times;
               });
            } break;
            case 218: { // unstable ghoul
               var times = m602, i = 0;
               var senv1 = { attacker: slot.f[0], defenser: null };
               var senv2 = { attacker: slot.e[0], defenser: null };
               if (m.flags.tri) times *= 2;
               for (i = 0; i < times; i++) {
                  var death = [];
                  G.event.orderMinions(slot.f).forEach(function (mf) {
                     if (mf === m) return;
                     if (mf.hp <= 0) return;
                     senv2.defenser = mf;
                     if (m.flags.shield) {
                        mf.flags.shield = false;
                        G.event.triggerOutOfShield(mf, senv2);
                     } else {
                        mf.hp -= 1;
                        G.event.triggerDamaged(mf, senv2);
                        if (mf.hp <= 0) {
                           death.push(mf);
                        }
                     }
                  });
                  death.forEach(function (mf) {
                     senv2.defenser = mf;
                     G.event.triggerDead(mf, senv2);
                     G.event.delMinion(mf, senv2);
                  });
                  death = [];
                  G.event.orderMinions(slot.e).forEach(function (me) {
                     if (me.hp <= 0) return;
                     senv1.defenser = me;
                     if (me.flags.shield) {
                        me.flags.shield = false;
                        G.event.triggerOutOfShield(me, senv1);
                     } else {
                        me.hp -= 1;
                        G.event.triggerDamaged(me, senv1);
                        if (me.hp <= 0) {
                           death.push(me);
                        }
                     }
                  });
                  death.forEach(function (me) {
                     senv1.defenser = me;
                     G.event.triggerDead(me, senv1);
                     G.event.delMinion(me, senv1);
                  });
               }
            } break;
            case 311: { // infested wolf
               var queue = [];
               var template = api.newMinionById(15, m.flags.tri);
               var n = m602 * 2;
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var summon = template.clone();
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = 0; j < m312 && queue.length <= 7; j++) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 315: { // piloted shredder
               var queue = [];
               var n = m602 * (m.flags.tri?2:1);
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var sid = randomPick(constants.junior);
                  var summon = api.newMinionById(sid, false);
                  // TODO: if we summon 602 or 312, how to summon more minions?
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = m312; j > 0 && queue.length <= 7; j--) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     helper.summonMurlocBuff(copy, slot.f, buff);
                     helper.summonDemonBuff(copy, slot.f, buff);
                     helper.summonPirateBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
                  helper.summonMurlocBuff(summon, slot.f, buff);
                  helper.summonDemonBuff(summon, slot.f, buff);
                  helper.summonPirateBuff(summon, slot.f, buff);
               }
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; });
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; });
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case 316: { // replicating menace
               var queue = [];
               var n = m602 * (1 + m312) * 3;
               if (n > 7) n = 7;
               var template = api.newMinionById(9, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 321: { // the beast
               var queue = [];
               var n = m602 * (1 + m312);
               if (n > 7) n = 7;
               var template = api.newMinionById(3); // (3 3) and tri(3 3)
               for (var i = 0; i < n; i++) queue.push(template.clone());
               var efirst = G.event.slots.first[slot.ecur];
               G.event.addMinion(queue, slot.e, efirst);
               if (efirst === 0) {
                  slot.e.push(slot.e.shift());
               }
            } break;
            case 411: { // mechano-egg
               var queue = [];
               var n = m602 * (1 + m312);
               if (n > 7) n = 7;
               var template = api.newMinionById(13, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 414: { // savannah highmane
               var queue = [];
               var template = api.newMinionById(5, m.flags.tri);
               var n = m602 * 2;
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var summon = template.clone();
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = 0; j < m312 && queue.length <= 7; j++) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 508: { // king bagurgle
               var times = m602;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  if (m.type !== 3) return; // murloc
                  m.atk += 2 * times;
                  m.hp += 2 * times;
               });
            } break;
            case 613: { // goldrinn, the great wolf
               var times = m602;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  if (m.type !== 1) return; // beast
                  m.atk += 4 * times;
                  m.hp += 4 * times;
               });
            } break;
            case 516: { // sneed\'s old shredder
               var queue = [];
               var n = m602 * (m.flags.tri?2:1);
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.orange);
                  var summon = api.newMinionById(sid, false);
                  // TODO: if we summon 602 or 312, how to summon more minions?
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = m312; j > 0 && queue.length <= 7; j--) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     helper.summonMurlocBuff(copy, slot.f, buff);
                     helper.summonDemonBuff(copy, slot.f, buff);
                     helper.summonPirateBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
                  helper.summonMurlocBuff(summon, slot.f, buff);
                  helper.summonDemonBuff(summon, slot.f, buff);
                  helper.summonPirateBuff(summon, slot.f, buff);
               }
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; });
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; });
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case 518: { // viodlord
               var queue = [];
               var n = m602 * (1 + m312);
               var template = api.newMinionById(18, m.flags.tri);
               for (var i = 0; i < n; i++) {
                  var summon = template.clone();
                  helper.summonDemonBuff(summon, slot.f, buff);
                  queue.push(summon);
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 604: { // ghastcoiler
               var queue = [];
               var n = m602 * (m.flags.tri?4:2);
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.deathrattle);
                  var summon = api.newMinionById(sid, false);
                  // TODO: if we summon 602 or 312, how to summon more minions?
                  helper.summonBeastBuff(summon, slot.f, buff);
                  queue.push(summon);
                  for (var j = m312; j > 0 && queue.length <= 7; j--) {
                     var copy = summon.clone();
                     helper.summonBeastBuff(copy, slot.f, buff);
                     helper.summonMurlocBuff(copy, slot.f, buff);
                     helper.summonDemonBuff(copy, slot.f, buff);
                     helper.summonPirateBuff(copy, slot.f, buff);
                     queue.push(copy);
                  }
                  helper.summonMurlocBuff(summon, slot.f, buff);
                  helper.summonDemonBuff(summon, slot.f, buff);
                  helper.summonPirateBuff(summon, slot.f, buff);
               }
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; });
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; });
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case 607: { // kangor\'s apprentiee
               if (!m.flags.pool) break;
               if (!m.flags.pool.length) break;
               var queue = [];
               var n = m.flags.pool.length;
               for (var i = 0; i < m602 && queue.length <= 7; i ++) {
                  for (var j = 0; j < n && queue.length <= 7; j++) {
                     var one = m.flags.pool[j];
                     var template = api.newMinionById(one.id, one.flags.tri);
                     for (var k = 0; k < m312 + 1 && queue.length <= 7; k++) {
                        queue.push(template.clone());
                     }
                  }
               }
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 610: { // nadina the red
               var times = m602;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  if (m.type !== 5) return; // dragon
                  m.atk += times;
                  m.hp += times;
               });
            } break;
            case 611: { // the tide razor
               var queue = [];
               var n = m602 * 3;
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.all);
                  var summon = api.newMinionById(sid, true);
                  helper.summonPirateBuff(summon, slot.f, buff);
                  for (var j = m312 + 1; j > 0 && queue.length <= 7; j--) {
                     queue.push(helper.clone());
                  }
               }
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; });
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; });
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
         }
      }
   };
   G.event.triggerPostAttack = function (m, env) {
      var slot = G.event.getFriendEnemySlot(m, env);

      // x 409 herald of flame
      if (m.id === 409 && env.overkill) {
         var barrier = new Minion(-99, 0, 1, 0, { dead: true });
         var virtual = api.newMinionById(-2, m.flags.tri);
         slot.f.push(barrier);
         slot.f.push(virtual);
         slot.f.push(barrier);
         var efirst = G.event.slots.first[slot.ecur], ei = efirst;
         var md = slot.e[ei];
         var attacked = [];
         while (md.hp > 0) {
            attacked.push(md);
            if (md.hp < virtual.atk) {
               md.flags.dead = true;
               ei = (ei + 1) % slot.e.length;
               md = slot.e[ei];
               // e.g. 6 minions, each.hp = 2; 3 killed, 1 2 4 5 6 should be killed also
               // 1 2 3 4 5 6
               //     x
               // - -   - - -
               if (md.hp <= 0 && ei !== efirst) {
                  ei = (ei + 1) % slot.e.length;
                  md = slot.e[ei];
                  if (attacked.indexOf(md) >= 0) break;
               }
               continue;
            }
            break;
         }
         attacked.forEach(function (md) {
            var env = { attacker: virtual, defenser: md };
            T.track([m.clone(), md.clone(), virtual.atk]); // debug
            virtual.attack(md);
            if (md.hp <= 0) {
               G.event.delMinion(md, env);
            }
         });
         slot.f.pop();
         slot.f.pop();
         slot.f.pop();
      }

      // x 506 ironhide direhorn
      if (m.id === 506 && env.overkill) {
         var buff = {};
         var m312 = helper.countM312(slot.f);
         var queue = [];
         var template = api.newMinionById(7, m.flags.tri);
         helper.summonBeastBuff(template, slot.f, buff);
         queue.push(template.clone());
         for (var i = 0; i < m312; i++) {
            var copy = tempalte.clone();
            helper.summonBeastBuff(copy, slot.f, buff);
            queue.push(copy);
         }
         G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1)
      }

      // x 512 nat pagle, extreme angler
      if (m.id === 512 && env.overkill) {
         var m312 = helper.countM312(slot.f);
         var n = 1 + m312;
         var queue = [];
         var template = api.newMinionById(17, m.flags.tri);
         for (var i = 0; i < n; i++) {
            queue.push(template.clone());
         }
         G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1)
      }

      // x 515 seabreaker goliath
      if (m.id === 512 && env.overkill) {
         slot.f.forEach(function (mf) {
            if (mf === m) return;
            if (mf.type !== 6 && mf.type !== 99) return;
            var val = m.flags.tri?4:2;
            mf.hp += val;
            mf.atk += val;
         });
      }

      // windfury
      // x 515 seabreaker goliath
      // x 612 zapp slywick
      // x 614 amalgadon
      if ((m.id === 515 || m.id === 614) && m.hp > 0 && m.flags.windfury) {
         var count = 2;
         if (!m.flags.atkT) m.flags.atkT = 1;
         if (m.flags.atkT < count) {
            m.flags.atkT ++;
            var md = G.event.getDefenser(m, slot.e);
            T.track([m.clone(), md.clone()]); // debug
            m.attack(md);
            if (md.hp <= 0 && env.defenser !== md) {
               G.event.delMinion(md, env);
            }
         } else {
            m.flags.atkT = 1;
         }
      }
      if (m.id === 612 && m.hp > 0 && m.flags.windfury) {
         var count = m.flags.tri?4:2;
         if (!m.flags.atkT) m.flags.atkT = 1;
         if (m.flags.atkT < count) {
            m.flags.atkT ++;
            var md = G.event.getDefenser(m, slot.e);
            T.track([m.clone(), md.clone()]); // debug
            m.attack(md);
            if (md.hp <= 0 && env.defenser !== md) {
               G.event.delMinion(md, env);
            }
         } else {
            m.flags.atkT = 1;
         }
      }
   };

   api.newMinionById = function (id, tri) {
      var m = G.pool.filter(function (x) { return x.id === id; })[0];
      if (!m) return null;
      var newone = m.clone();
      if (tri) {
         newone.flags.tri = true;
         newone.hp *= 2;
         newone.atk *= 2;
      }
      return newone;
   };
   return api;
}

function Minion(id, atk, hp, type, flags) {
   this.id = id;
   this.atk = atk;
   this.hp = hp;
   this.type = type;
   this.flags = Object.assign({
      taunt: false,
      shield: false,
      poison: false,
      reborn: false,
      noatk: false,
      windfury: false,
      tri: false,
      immune: false,
      deathrattle: [],
      function: []
   }, flags);
}

Minion.prototype = {
   clone: function () {
      return new Minion(this.id, this.atk, this.hp, this.type, this.flags);
   },
   attack: function (another) {
      var env = {
         attacker: this, defenser: another,
         dhp: 0, dhp2: 0,
         shield: false, shield2: false,
         overkill: false
      };

      G.event.triggerPreAttack(this, env);

      // atk=0 when Illidan Stormrage with mechano-egg (0 5)
      if (this.atk > 0 && !another.flags.immune) {
         if (another.flags.shield) {
            another.flags.shield = false;
            env.shield2 = true;
         } else {
            another.hp -= this.atk;
            env.dhp2 = this.atk;
            if (another.hp > 0 && this.flags.poison) {
               another.hp = 0;
            }
         }
      }

      if (another.atk > 0 && !this.flags.immune) {
         if (this.flags.shield) {
            this.flags.shield = false;
            env.shield = true;
         } else {
            this.hp -= another.atk;
            env.dhp = another.atk;
            if (this.hp > 0 && another.flags.poison) {
               this.hp = 0;
            }
         }
      }
      if (another.hp < 0) {
         env.overkill = true;
      }

      G.event.triggerAttack(this, env);
      if (env.dhp2 > 0) {
         G.event.triggerDamaged(another, env);
      } else if (env.shield2) {
         G.event.triggerOutOfShield(another, env);
      }
      if (env.dhp > 0) {
         G.event.triggerDamaged(this, env);
      } else if (env.shield) {
         G.event.triggerOutOfShield(this, env);
      }
      G.event.triggerPostAttack(this, env);
      if (env.moreDamaged && env.moreDamaged[0] && env.moreDamaged[0].hp <= 0) {
         env.moreDamaged[0].flags.dead = true;
         G.event.triggerDead(env.moreDamaged[0], env);
         G.event.delMinion(env.moreDamaged[0], env);
      }
      if (another.hp <= 0) {
         another.flags.dead = true;
         G.event.triggerDead(another, env);
      }
      if (env.moreDamaged && env.moreDamaged[1] && env.moreDamaged[1].hp <= 0) {
         env.moreDamaged[1].flags.dead = true;
         G.event.triggerDead(env.moreDamaged[1], env);
         G.event.delMinion(env.moreDamaged[1], env);
      }
      if (this.hp <= 0) {
         this.flags.dead = true;
         G.event.triggerDead(this, env);
      }
      if (another.hp > 0) {
         G.event.triggerDefense(another, env);
      }

   },
   toString: function () {
      return JSON.stringify({
         id: this.id,
         hp: this.hp,
         atk: this.atk
      });
   }
};


T.debug = true;
var api = Version20200728();

var slotA = [], slotB = [];
//slotA.push(new Minion(0, 2, 2, 0, {}));
//slotA.push(new Minion(2, 2, 1, 0, {}));
//slotB.push(new Minion(3, 2, 1, 0, {}));
//slotB.push(new Minion(4, 1, 1, 0, { shield: true, taunt: true }));

/*
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(api.newMinionById(218));
slotB.push(new Minion(0, 2, 2, 0, {}));
slotB.push(api.newMinionById(218));
*/

/*
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotA.push(new Minion(0, 2, 2, 0, {}));
slotB.push(api.newMinionById(105, true));
slotB.push(new Minion(0, 2, 2, 0, {}));
slotB.push(new Minion(0, 2, 2, 0, {}));
*/

/*
slotA.push(new Minion(0, 9, 7, 0, {}));
slotB.push(api.newMinionById(321, false));
slotB.push(new Minion(0, 3, 3, 0, {}));
*/

/*
slotA.push(new Minion(0, 9, 9, 0, {}));
var m206 = api.newMinionById(206, false);
m206.flags.deathrattle = [api.newMinionById(316)];
slotB.push(m206);
*/

/*
slotA.push(new Minion(0, 9, 10, 0, {}));
slotB.push(api.newMinionById(313, false));
slotB.push(api.newMinionById(206, false));
*/

/*
slotA.push(new Minion(0, 7, 20, 0, {}));
slotB.push(api.newMinionById(605, false));
*/

/*
slotA.push(new Minion(0, 7, 6, 0, {}));
slotA.push(new Minion(0, 7, 6, 0, {}));
slotB.push(api.newMinionById(506, false));
slotB.push(new Minion(0, 1, 1, 0, {}));
slotB.push(new Minion(0, 0, 1, 0, {}));
*/

/*
slotA.push(new Minion(0, 1, 1, 0, {}));
slotA.push(new Minion(0, 1, 1, 0, {}));
slotA.push(new Minion(0, 1, 1, 0, {}));
slotA.push(new Minion(0, 1, 1, 0, {}));
slotA.push(new Minion(0, 1, 1, 0, {}));
slotA.push(new Minion(0, 5, 4, 0, { taunt: true }));
slotB.push(api.newMinionById(409, false));
*/

/*
slotA.push(new Minion(0, 1, 1, 0, {}));
slotA.push(new Minion(1, 3, 1, 0, {}));
slotA.push(new Minion(2, 2, 1, 0, {}));
slotA.push(new Minion(3, 1, 1, 0, {}));
slotA.push(new Minion(4, 1, 1, 0, {}));
slotA.push(new Minion(5, 5, 4, 0, { taunt: true }));
slotB.push(api.newMinionById(612, false));
*/

/*
slotA.push(new Minion(1, 1, 1, 0, {}));
slotA.push(new Minion(1, 3, 4, 0, {}));
slotA.push(new Minion(1, 9, 4, 0, { taunt: true }));
slotB.push(api.newMinionById(413, false));
slotB.push(api.newMinionById(323, false));
*/

/*
slotA.push(new Minion(1, 3, 3, 0, {}));
slotA.push(new Minion(2, 3, 3, 0, {}));
slotA.push(new Minion(3, 3, 3, 0, {}));
slotA.push(new Minion(4, 3, 3, 0, {}));
slotB.push(new Minion(5, 1, 1, 4, {}));
slotB.push(api.newMinionById(320, true));
*/

/*
slotA.push(new Minion(1, 2, 10, 0, {}));
slotB.push(api.newMinionById(201, false));
slotB.push(new Minion(2, 2, 2, 0, {}));
slotB.push(api.newMinionById(201, false));
*/

/*
slotA.push(api.newMinionById(602, false));
slotA.push(new Minion(1, 4, 2, 0, {}));
slotB.push(api.newMinionById(403, false));
slotB.push(new Minion(2, 8, 6, 0, {}));
slotB.push(new Minion(2, 8, 6, 0, {}));
*/

/*
slotA.push(api.newMinionById(109, false));
slotB.push(new Minion(0, 2, 2, 0, {}));
*/

/*
slotA.push(api.newMinionById(409, false));
slotA.push(new Minion(1, 5, 5, 6, {}));
slotA.push(new Minion(2, 5, 4, 6, {}));
slotA.push(new Minion(3, 4, 4, 6, {}));
slotB.push(new Minion(4, 11, 2, 3, {}));
slotB.push(new Minion(5, 6, 4, 3, {}));
slotB.push(new Minion(6, 3, 2, 3, {}));
slotB.push(new Minion(7, 1, 2, 3, {}));
slotB.push(new Minion(8, 2, 2, 3, {}));
slotB.push(new Minion(9, 2, 2, 3, {}));
slotB.push(api.newMinionById(209, false));
*/

function last(slot) { return slot[slot.length-1]; }
slotA.push(api.newMinionById(321, false));
last(slotA).hp += 1; last(slotA).atk += 1;
slotA.push(api.newMinionById(201, false));
last(slotA).hp += 11; last(slotA).atk += 11;
slotA.push(api.newMinionById(112, false));
slotA.push(new Minion(-11, 3, 3, 2, {}));
slotA.push(api.newMinionById(114, false));
slotA.push(new Minion(-12, 3, 6, 2, {}));
slotA.push(api.newMinionById(214, false));
last(slotA).hp += 10; last(slotA).atk += 10;
slotB.push(new Minion(-13, 2, 1, 3, {}));
slotB.push(new Minion(-14, 7, 19, 3, {}));
slotB.push(new Minion(-15, 5, 2, 2, { shield: true }));
slotB.push(new Minion(-16, 3, 2, 2, { shield: true }));
slotB.push(new Minion(-17, 3, 3, 2, {}));
slotB.push(new Minion(-18, 2, 1, 3, {}));
slotB.push(new Minion(-19, 2, 7, 3, {}));

console.log(slotA, slotB);
var res = { a: 0, b: 0, tie: 0 };
var n = 10000;
for (var i = 0; i < n; i ++) {
   var r = G.sandbox(slotA, slotB);
   if (r[0].length > 0 && r[1].length > 0) res.tie ++;
   else if (r[0].length > 0) res.a ++;
   else if (r[1].length > 0) res.b ++;
   else res.tie ++;
}
console.log(res, 'last battle trace:', T.steps);
