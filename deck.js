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
            if (md.hp <= 0 || md.flags.dead) {
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
         var atkgt0 = 0;
         if (slot1.length === 0 || slot2.length === 0) return true;
         if (slot1.length > 0) {
            atkgt0 += slot1.map(function (x) {
               return x.atk > 0?1:0;
            }).reduce(function (x, y) {
               return x + y;
            });
         }
         if (slot2.length > 0) {
            atkgt0 += slot2.map(function (x) {
               // XXX: there is a bug that x is undefined;
               //      need to investigate where insert undefined
               if (!x) return 0;
               return x.atk > 0?1:0;
            }).reduce(function (x, y) {
               return x + y;
            });
         }
         return atkgt0 === 0;
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
            return x.hp > 0 && !x.flags.dead;
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
         if (index < firstM) G.event.slots.first[cur] += n;
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
   // for minion type and pool
   // see also pool-`date`.js
   loadMinionPool();
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
                     if (m.type !== 6 && m.type !== 99) return;
                     var val = source.flags.tri?2:1;
                     m.atk += val;
                     m.hp += val;
                  });
                  break;
               case 416: // siegebreaker
                  slot.forEach(function (m) {
                     if (m === source) return;
                     if (m.type !== 4 && m.type !== 99) return;
                     var val = source.flags.tri?2:1;
                     m.atk += val;
                  });
                  break;
               case 510: // mal\'ganis
                  slot.forEach(function (m) {
                     if (m === source) return;
                     if (m.type !== 4 && m.type !== 99) return;
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
      countM502: function (slot) {
         var m502s = slot.filter(function (x) {
            if (x.flags.dead) return false;
            if (x.hp <= 0) return false;
            return x.id === 502;
         });
         var m502 = 1;
         if (m502s.length) m502 = m502s.map(function (x) { return x.flags.tri?3:2; }).reduce(function (x, y) { return x>y?x:y; });
         return m502;
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
         if (slot.length <= 1) return null;
         var cur = G.event.slots.minions[0]===slot?0:1;
         var first = G.event.slots.first[cur] || 0;
         var mi = slot.indexOf(m);
         var index = mi;
         if (mi === first) return null;
         while (true) {
            index --;
            if (index < 0) index += slot.length;
            var mf = slot[index];
            if (index === mi) return null;
            if (mf.hp > 0) return mf;
            if (index === first) return null;
         }
      },
      getRightMinion: function (m, slot) {
         if (slot.length <= 1) return null;
         var cur = G.event.slots.minions[0]===slot?0:1;
         var first = G.event.slots.first[cur] || 0;
         var index = slot.indexOf(m);
         var visited = [];
         while (true) {
            index = (index + 1) % slot.length;
            if (index === first) return null;
            if (visited.indexOf(index) >= 0) return null;
            var mf = slot[index];
            if (mf.hp > 0) return mf;
            visited.push(index);
         }
      }
   };

   G.event.initMinions = function (slot) {
      var buff = {};
      // x 209 murloc warleader
      helper.countMurlocSummonBuff(slot, buff);
      slot.forEach(function (x) {
         if (x.type !== 3 && x.type !== 99) return; // murloc
         helper.summonMurlocBuff(x, slot, buff);
         if (x.id === 209) {
            var val = 2 * (x.flags.tri?2:1);
            x.atk -= val;
         }
      });

      // x 215 southsea captain
      helper.countPirateSummonBuff(slot, buff);
      slot.forEach(function (x) {
         if (x.type !== 6 && x.type !== 99) return; // pirate
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
         if (x.type !== 4 && x.type !== 99) return; // demon
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
         var m109s = slot.f.filter(function (m) { return m.id === 109; });
         var damage = slot.f.filter(function (m) { return m.type === 5 || m.type === 99; }).length;
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
               if (md.hp <= 0 || md.flags.dead) {
                  md.flags.dead = true;
                  G.event.delMinion(md, { attacker: m, defenser: md });
               }
            }
         });
         slot.f.splice(slot.f.indexOf(virtual), 1);
         slot.f.splice(slot.f.indexOf(barrier), 1);
         slot.f.splice(slot.f.indexOf(barrier), 1);
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
      if (m.type === 6 || m.type === 99) {
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
               if (x.flags.dead) return;
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
         if (available.length > 0) {
            var target = randomPick(available);
            var subenv = { attacker: slot.e[0], defense: target };
            G.event.triggerDead(target, subenv, true);
         }
      }

      // x 219 waxrider togwaggle
      if (m.type === 5 || m.type === 99) {
         if (env.defenser.hp <= 0 || env.defenser.flags.dead) {
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
               if ((md.hp <= 0 || md.flags.dead) && env.defenser !== md) {
                  G.event.delMinion(md, denv);
               }
            });
            slot.f.splice(slot.f.indexOf(virtual), 1);
            slot.f.splice(slot.f.indexOf(barrier), 1);
            slot.f.splice(slot.f.indexOf(barrier), 1);
         });
      }
   };
   G.event.triggerDefense = function (m, env) {
      var slot = G.event.getFriendEnemySlot(m, env);
      // x 323 yo-ho-ogre and should be real attack instead of merely damage
      if (m.id === 323 && env.attacker.id > 0) {
         var md = G.event.getDefenser(m, slot.e);
         if (md) {
            var denv = { attacker: m, defenser: md };
            T.track([m.clone(), md.clone()]); // debug
            m.attack(md);
            if ((md.hp <= 0 || md.flags.dead) && env.attacker !== md) {
               G.event.delMinion(md, denv);
            }
         }
      }
   };
   G.event.triggerOutOfShield = function (m, env) {
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

      // if m.hp <= 0, addMinion will summon one more
      // here to correct the number
      // e.g. 7 minions meanwhile 310/415/605 damaged and die; no summon
      var max = 7 - slot.f.filter(function (x) {
         if (x.hp > 0) return true;
         if (x.flags.dead) return false;
         if (x === m) return true;
         return false;
      });

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
         if (queue.length > max) queue = queue.slice(0, max);
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
         if (queue.length > max) queue = queue.slice(0, max);
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
         if (queue.length > max) queue = queue.slice(0, max);
         n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
         var added = queue.slice(0, n);
         var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; }).length;
         var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; }).length;
         helper.shieldM306(slot.f, mechn);
         helper.buffM107(slot.f, murlocn);
         helper.newBuffMinions(slot.f, added);
      }
   };
   G.event.triggerDead = function (m, env, skipDeadBuff) {
      // XXX: should trigger deathrattle round by round
      //      instead of one by one
      var slot = G.event.getFriendEnemySlot(m, env);
      var m502 = helper.countM502(slot.f);
      var m312 = helper.countM312(slot.f);

      if (m.flags.deathrattle) {
         var mi = slot.f.indexOf(m);
         var n = m.flags.deathrattle.length;
         if (n > 0) {
            slot.f.splice(mi + 1, 0, ...m.flags.deathrattle);
         }
      }
      processOne(m, env);
      if (m.flags.deathrattle) {
         m.flags.deathrattle.forEach(function (deathrattle) {
            // deathrattle -> Minion
            deathrattle.hp = 0;
            deathrattle.flags.dead = true;
            processOne(deathrattle, env);
            slot.f.splice(slot.f.indexOf(deathrattle), 1);
         });
      }
      if (!skipDeadBuff) {
         deadBuff(m, env);
      }

      function deadBuff(m, env) {
         // x 113 scaveging hyena
         if (m.type === 1 || m.type === 99) { // beast
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
         if (m.type === 2 || m.type === 99) { // mech
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
            var m607s = slot.f.filter(function (x) {
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
               var reborn = api.newMinionById(302, m.flags.tri);
               reborn.flags.reborn = false;
               queue.push(reborn);
            }
            G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
         }
         // TODO: generic reborn; beast, murloc, mech buff ...

         // x 320 soul juggler
         if (m.type === 4 || m.type === 99) { // demon
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
                  if ((md.hp <= 0 || md.flags.dead) && env.defenser !== md && env.attacker !== md) {
                     G.event.delMinion(md, denv);
                  }
               });
               slot.f.splice(slot.f.indexOf(virtual), 1);
               slot.f.splice(slot.f.indexOf(barrier), 1);
               slot.f.splice(slot.f.indexOf(barrier), 1);
            }
         }

         // x 209 murloc warleader
         if (m.id === 209) {
            var v = m.flags.tri?4:2;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 3 && mf.type !== 99) return; // murloc
               mf.atk -= v;
            });
         }

         // x 215 southsea captain
         if (m.id === 215) {
            var v = m.flags.tri?2:1;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 6 && mf.type !== 99) return; // pirate
               mf.atk -= v;
               mf.hp -= v;
               if (mf.hp <= 0) mf.hp = 1;
            });
         }

         // x 416 siegebreaker
         if (m.id === 416) {
            var v = m.flags.tri?2:1;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 4 && mf.type !== 99) return; // demon
               mf.atk -= v;
            });
         }

         // x 510 mal\'ganis
         if (m.id === 510) {
            var v = m.flags.tri?4:2;
            slot.f.forEach(function (mf) {
               if (mf === m) return;
               if (mf.type !== 4 && mf.type !== 99) return; // demon
               mf.atk -= v;
               mf.hp -= v;
               if (mf.hp <= 0) mf.hp = 1;
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
               for (var i = 0; i < m502 && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.all);
                  var summon = api.newMinionById(sid, true);
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
               // recaculate 502/312
               m502 = helper.countM502(slot.f);
               m312 = helper.countM312(slot.f);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; }).length;
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; }).length;
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case -1: { // #seeds
               var queue = [];
               var n = m502 * (1 + m312);
               var template = api.newMinionById(11, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 104: { // fiendish servant
               var times = m502, i = 0;
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
               var n = m502 * (1 + m312);
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
               for (var i = 0; i < m502; i++) {
                  for (var j = -1; j < m312; j ++) {
                     queue.push(template.clone());
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
                     if (mf.hp <= 0 || mf.flags.dead) {
                        mf.flags.dead = true;
                        offset --;
                        G.event.delMinion(mf, denv);
                     }
                     if ((md.hp <= 0 || mf.flags.dead) && env.defenser !== md && env.attacker !== md) {
                        md.flags.dead = true;
                        G.event.delMinion(md, denv);
                     }
                  });
               }
            } break;
            case 114: { // selfless hero
               var times = m502, i = 0;
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
               var n = m502 * (1 + m312);
               var template = api.newMinionById(2, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 205: { // imprisoner
               var queue = [];
               var n = m502 * (1 + m312);
               var template = api.newMinionById(6, m.flags.tri);
               for (var i = 0; i < n; i++) {
                  var summon = template.clone();
                  helper.summonDemonBuff(summon, slot.f, buff);
                  queue.push(summon);
               }
               G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
            } break;
            case 206: { // kaboom bot
               var times = m502, i = 0;
               if (m.flags.tri) times *= 2;
               var targets = [];
               for (i = 0; i < times; i ++) {
                  var target = G.event.getRandomMinion(slot.e);
                  if (!target) break;
                  targets.push(target);
                  target.hp -= 4;
               }
               targets.forEach(function (target) {
                  target.hp += 4;
               });
               if (targets.length > 0) {
                  var efirst = G.event.slots.first[slot.ecur];
                  var enemies = G.event.orderMinions(slot.e.slice(), efirst);
                  targets.forEach(function (me) {
                     me.__order = enemies.indexOf(me);
                  });
                  targets = targets.sort(function (x, y) {
                     return x.__order - y.__order;
                  });
                  targets.forEach(function (target) {
                     delete target.__order;
                     var subenv = { attacker: m, defenser: target };
                     T.track([m.clone(), target.clone()]); // debug
                     if (target.flags.shield) {
                        target.flags.shield = false;
                        G.event.triggerOutOfShield(target, subenv);
                     } else {
                        target.hp -= 4;
                        G.event.triggerDamaged(target, subenv);
                        if (target.hp <= 0 || target.flags.dead) {
                           G.event.triggerDead(target, subenv);
                           if (target !== env.attacker || target !== env.defenser) {
                              G.event.delMinion(target, subenv);
                           }
                        }
                     }
                  });
               }
            } break;
            case 207: { // kindly grandmother
               var queue = [];
               var template = api.newMinionById(1, m.flags.tri);
               for (var i = 0; i < m502 && queue.length <= 7; i++) {
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
               var n = m502 * m.atk;
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
               var times = m502;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  m.atk += times;
                  m.hp += times;
               });
            } break;
            case 218: { // unstable ghoul
               var times = m502, i = 0;
               var senv1 = { attacker: slot.f[0], defenser: null };
               var senv2 = { attacker: slot.e[0], defenser: null };
               if (m.flags.tri) times *= 2;
               for (i = 0; i < times; i++) {
                  var death = [];
                  G.event.orderMinions(slot.f).forEach(function (mf) {
                     if (mf === m) return;
                     if (mf.hp <= 0 || mf.flags.dead) return;
                     senv2.defenser = mf;
                     if (mf.flags.shield) {
                        mf.flags.shield = false;
                        G.event.triggerOutOfShield(mf, senv2);
                     } else {
                        mf.hp -= 1;
                        G.event.triggerDamaged(mf, senv2);
                        if (mf.hp <= 0 || mf.flags.dead) {
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
                     if (me.hp <= 0 || me.flags.dead) return;
                     senv1.defenser = me;
                     if (me.flags.shield) {
                        me.flags.shield = false;
                        G.event.triggerOutOfShield(me, senv1);
                     } else {
                        me.hp -= 1;
                        G.event.triggerDamaged(me, senv1);
                        if (me.hp <= 0 || me.flags.dead) {
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
               var n = m502 * 2;
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
               var n = m502 * (m.flags.tri?2:1);
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var sid = randomPick(constants.junior);
                  var summon = api.newMinionById(sid, false);
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
               // recaculate 502/312
               m502 = helper.countM502(slot.f);
               m312 = helper.countM312(slot.f);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; }).length;
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; }).length;
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case 316: { // replicating menace
               var queue = [];
               var n = m502 * (1 + m312) * 3;
               if (n > 7) n = 7;
               var template = api.newMinionById(9, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 321: { // the beast
               var queue = [];
               var n = m502 * (1 + m312);
               if (n > 7) n = 7;
               var template = api.newMinionById(3); // (3 3) and tri(3 3)
               for (var i = 0; i < n; i++) queue.push(template.clone());
               var efirst = G.event.slots.first[slot.ecur];
               n = G.event.addMinion(queue, slot.e, efirst);
               if (efirst === 0) {
                  while (n > 0) {
                     slot.e.push(slot.e.shift());
                     n --;
                  }
               }
            } break;
            case 411: { // mechano-egg
               var queue = [];
               var n = m502 * (1 + m312);
               if (n > 7) n = 7;
               var template = api.newMinionById(13, m.flags.tri);
               for (var i = 0; i < n; i++) queue.push(template.clone());
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               helper.shieldM306(slot.f, n);
            } break;
            case 414: { // savannah highmane
               var queue = [];
               var template = api.newMinionById(5, m.flags.tri);
               var n = m502 * 2;
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
               var times = m502;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  if (m.type !== 3 && m.type !== 99) return; // murloc
                  m.atk += 2 * times;
                  m.hp += 2 * times;
               });
            } break;
            case 613: { // goldrinn, the great wolf
               var times = m502;
               if (m.flags.tri) times *= 2;
               slot.f.forEach(function (m) {
                  if (m.type !== 1 && m.type !== 99) return; // beast
                  m.atk += 4 * times;
                  m.hp += 4 * times;
               });
            } break;
            case 516: { // sneed\'s old shredder
               var queue = [];
               var n = m502 * (m.flags.tri?2:1);
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.orange);
                  var summon = api.newMinionById(sid, false);
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
               // recaculate 502/312
               m502 = helper.countM502(slot.f);
               m312 = helper.countM312(slot.f);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; }).length;
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; }).length;
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case 518: { // viodlord
               var queue = [];
               var n = m502 * (1 + m312);
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
               var n = m502 * (m.flags.tri?4:2);
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.deathrattle);
                  var summon = api.newMinionById(sid, false);
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
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; }).length;
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; }).length;
               helper.shieldM306(slot.f, mechn);
               helper.buffM107(slot.f, murlocn);
               helper.newBuffMinions(slot.f, added);
            } break;
            case 607: { // kangor\'s apprentiee
               if (!m.flags.pool) break;
               if (!m.flags.pool.length) break;
               var queue = [];
               var n = m.flags.pool.length;
               for (var i = 0; i < m502 && queue.length <= 7; i ++) {
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
               slot.f.forEach(function (m) {
                  if (m.type !== 5 && m.type !== 99) return; // dragon
                  m.flags.shield = true;
               });
            } break;
            case 611: { // the tide razor
               var queue = [];
               var n = m502 * 3;
               for (var i = 0; i < n && queue.length <= 7; i++) {
                  var buff = {};
                  var sid = randomPick(constants.pirate);
                  var summon = api.newMinionById(sid, false);
                  helper.summonPirateBuff(summon, slot.f, buff);
                  for (var j = m312 + 1; j > 0 && queue.length <= 7; j--) {
                     queue.push(summon.clone());
                  }
               }
               n = G.event.addMinion(queue, slot.f, slot.f.indexOf(m) + 1);
               var added = queue.slice(0, n);
               var mechn = added.filter(function (x) { return x.type === 2 || x.type === 99; }).length;
               var murlocn = added.filter(function (x) { return x.type === 3 || x.type === 99; }).length;
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
               if ((md.hp <= 0 || md.flags.dead) && ei !== efirst) {
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
            if (md.hp <= 0 || md.flags.dead) {
               G.event.delMinion(md, env);
            }
         });
         slot.f.splice(slot.f.indexOf(virtual), 1);
         slot.f.splice(slot.f.indexOf(barrier), 1);
         slot.f.splice(slot.f.indexOf(barrier), 1);
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
            var copy = template.clone();
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
      if (m.id === 515 && env.overkill) {
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
            if (md) {
               T.track([m.clone(), md.clone()]); // debug
               m.attack(md);
               if ((md.hp <= 0 || md.flags.dead) && env.defenser !== md) {
                  G.event.delMinion(md, env);
               }
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
            if (md) {
               T.track([m.clone(), md.clone()]); // debug
               m.attack(md);
               if ((md.hp <= 0 || md.flags.dead) && env.defenser !== md) {
                  G.event.delMinion(md, env);
               }
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

function Minion(id, atk, hp, type, flags, name) {
   this.id = id;
   this.name = name;
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
      var id = this.id;
      var m = G.pool.filter(function (x) { return x.id === id; })[0];
      var name = m?m.name:'(unknown)';
      var obj = {
         id: this.id,
         hp: this.hp,
         atk: this.atk,
         name: name,
         attr: []
      };
      if (this.flags.tri) obj.attr.push('TRI');
      if (this.flags.shield) obj.attr.push('divineShield');
      if (this.flags.poison) obj.attr.push('poisonous');
      if (this.flags.taunt) obj.attr.push('taunt');
      if (this.flags.windfury) obj.attr.push('windfury');
      if (this.flags.reborn) obj.attr.push('reborn');
      return JSON.stringify(obj);
   },
   toShortString: function () {
      var id = this.id;
      var m = G.pool.filter(function (x) { return x.id === id; })[0];
      var name = m?m.name:'(unknown)';
      if (this.flags.reborn) name = '*' + name;
      if (this.flags.taunt) name = '[' + name + ']';
      if (this.flags.shield) name = '<' + name + '>';
      if (this.flags.poison) name = 'x-' + name;
      if (this.flags.windfury) name = '2-' + name;
      name = '{' + name + ' ';
      if (this.flags.tri) name += 'T ';
      name += this.atk + ' ';
      name += this.hp;
      name += '}';
      return name;
   }
};


var api = Version20200728();

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

/*
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
*/

/*
function last(slot) { return slot[slot.length-1]; }
slotA.push(api.newMinionById(306, false));
last(slotA).hp = 2; last(slotA).atk = 13;
slotA.push(new Minion(-11, 22, 10, 2, {}));
last(slotA).flags.deathrattle = [api.newMinionById(316, false)];
slotA.push(new Minion(-12, 17, 11, 2, {}));
slotA.push(new Minion(-13, 3, 3, 2, {}));
slotA.push(new Minion(-14, 30, 20, 2, {}));
slotA.push(new Minion(-15, 2, 1, 3, {}));
slotA.push(new Minion(-12, 10, 6, 2, {}));
slotB.push(api.newMinionById(201, false));
last(slotB).hp = 4; last(slotB).atk = 4;
slotB.push(api.newMinionById(112, false));
slotB.push(api.newMinionById(201, false));
slotB.push(api.newMinionById(411, false));
last(slotB).hp = 7; last(slotB).atk = 2;
slotB.push(api.newMinionById(411, false));
last(slotB).hp = 6; last(slotB).atk = 1;
slotB.push(api.newMinionById(312, false));
last(slotB).hp = 4; last(slotB).atk = 4;
slotB.push(api.newMinionById(302, false));
*/

/*
function last(slot) { return slot[slot.length-1]; }
slotA.push(api.newMinionById(612, false));
slotA.push(api.newMinionById(411, false));
last(slotA).hp = 7; last(slotA).atk = 2;
slotA.push(new Minion(-12, 2, 4, 0, {}));
slotA.push(new Minion(614, 12, 6, 99, { shield: true, windfury: true }));
slotA.push(api.newMinionById(611, false));
slotA.push(api.newMinionById(312, true));
last(slotA).hp = 7; last(slotA).atk = 7;
slotB.push(api.newMinionById(306, false));
last(slotB).hp = 6; last(slotB).atk = 5;
slotB.push(api.newMinionById(306, false));
last(slotB).hp = 8; last(slotB).atk = 5;
slotB.push(api.newMinionById(302, false));
last(slotB).hp = 2; last(slotB).atk = 3;
slotB.push(api.newMinionById(302, false));
slotB.push(api.newMinionById(406, false));
slotB.push(api.newMinionById(415, false));
last(slotB).hp = 14; last(slotB).atk = 4; last(slotB).flags.taunt = true; last(slotB).flags.shield = true;
slotB.push(new Minion(-15, 8, 20, 3, {}));
*/

// {a: 4511, b: 4258, tie: 1231}
// slotA.push(api.newMinionById(604, false));
// slotB.push(api.newMinionById(605, false));

// {a: 9362, b: 350, tie: 288}
// slotA.push(api.newMinionById(611, false));
// slotB.push(api.newMinionById(605, false));

// {a: 1012, b: 8151, tie: 837}
// slotA.push(api.newMinionById(604, false));
// slotB.push(api.newMinionById(611, false));

// slotA.push(new Minion(1, 11, 40, 4, {}));
// slotB.push(api.newMinionById(611, false));

// slotA.push(new Minion(1, 7, 17, 4, {}));
// slotB.push(api.newMinionById(604, false));

// slotA.push(new Minion(1, 5, 21, 4, {}));
// slotB.push(api.newMinionById(605, false));
