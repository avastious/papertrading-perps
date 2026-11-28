// Cast specs for "The Day Email Stopped". Each part is swappable.
(function () {
  const CAST = {
    penny: {
      name: 'Penny Park', role: 'Lead. Office worker who just wants to send one email.',
      skin: '#c68863',
      head: { r: 84, sx: 1, sy: 0.96, neck: 10 },
      hair: { type: 'bun', color: '#2b1d1a' },
      face: { eyeDX: 30, eyeY: 2, eyeRx: 14, eyeRy: 18, mouthY: 42, blush: '#e0707a', browColor: '#2b1d1a' },
      body: { shape: 'trap', torsoW: 104, hipW: 92, torsoH: 132, color: '#3fa37a', color2: '#2f7f5e', outfit: 'cardigan', radius: 28 },
      arms: { len: 124, w: 24, color: '#3fa37a', hand: '#c68863' },
      legs: { len: 150, w: 28, color: '#2c3e66', shoe: '#d9483b', shoeLen: 46, shoeH: 22 },
      prop: 'mug',
    },
    sam: {
      name: 'Sam', role: 'On-call engineer. Phone buzzes at the worst moment.',
      skin: '#f3d2b3',
      head: { r: 82, sx: 0.96, sy: 1, neck: 8, hood: '#6b4fbb' },
      hair: { type: 'messy', color: '#d9692b' },
      face: { eyeDX: 28, eyeY: 4, eyeRx: 14, eyeRy: 16, mouthY: 44, bags: '#b48fb0', freckles: '#c77b52', browColor: '#a84c1c' },
      accessory: 'headset',
      body: { shape: 'trap', torsoW: 114, hipW: 102, torsoH: 140, color: '#6b4fbb', outfit: 'hoodie', radius: 34 },
      arms: { len: 130, w: 27, color: '#6b4fbb', hand: '#f3d2b3', cuff: '#5a40a3' },
      legs: { len: 156, w: 29, color: '#8a909c', shoe: '#f2f2f2', shoeLen: 48, shoeH: 22 },
      prop: 'laptop',
    },
    bigsby: {
      name: 'Mr Bigsby', role: 'Bank trader. Has a trade to confirm. Now.',
      skin: '#e8b48a',
      head: { r: 86, sx: 1.06, sy: 0.94, neck: 6 },
      hair: { type: 'fringe', color: '#b8bcc6' },
      face: { eyeDX: 32, eyeY: -2, eyeRx: 13, eyeRy: 15, mouthY: 46, mustache: '#b8bcc6', nose: true, browColor: '#8f939c', browW: 8 },
      body: { shape: 'belly', torsoW: 128, hipW: 132, torsoH: 150, color: '#dbe9f6', outfit: 'banker', radius: 30 },
      arms: { len: 126, w: 28, color: '#bcd4ee', hand: '#e8b48a', cuff: '#ffffff' },
      legs: { len: 136, w: 32, color: '#26272e', shoe: '#5a3a24', shoeLen: 50, shoeH: 22 },
      prop: 'phone',
    },
    gate: {
      name: 'Gate', role: 'The front-door server. Every email walks past him.',
      skin: '#c9d1dc',
      head: { r: 0 },
      hat: 'doorman',
      face: { style: 'led', ledColor: '#6ef0ff', panelY: 60, eyeDX: 30, eyeY: -6, eyeRx: 13, eyeRy: 15, mouthY: 22, mouthScale: 0.8, browW: 5 },
      body: { shape: 'box', torsoW: 164, torsoH: 262, color: '#8e2b3a', outfit: 'doormanCabinet', radius: 18, shoulderDrop: 120, shoulderIn: 6 },
      arms: { len: 120, w: 22, color: '#7d8796', hand: '#ffffff' },
      legs: { len: 96, w: 26, color: '#5d6a7e', shoe: '#26272e', shoeLen: 50, shoeH: 22 },
      prop: 'keys',
    },
    fax: {
      name: 'Faxie', role: 'A 1998 fax machine. Comes out of retirement.',
      skin: '#e9dcc0',
      head: { r: 0 },
      face: { panelY: 52, eyeDX: 34, eyeY: -4, eyeRx: 13, eyeRy: 15, mouthY: 20, mouthScale: 0.9, browColor: '#6b5f4a' },
      body: { shape: 'box', torsoW: 204, torsoH: 112, color: '#e9dcc0', outfit: 'fax', radius: 16, shoulderDrop: 64, shoulderIn: 4 },
      arms: { len: 68, w: 18, color: '#b7aa8e', hand: '#e9dcc0' },
      legs: { len: 52, w: 20, color: '#b7aa8e', shoe: '#7d8796', shoeLen: 36, shoeH: 16 },
      prop: 'paper',
    },
  };
  // Penny's email: a walking envelope (appliance-style puppet: face on the body)
  CAST.envelope = {
    name: 'The email', role: "Penny's email.", skin: '#fbf7ef',
    head: { r: 0 },
    face: { panelY: 60, eyeDX: 26, eyeY: -4, eyeRx: 11, eyeRy: 13, mouthY: 16, mouthScale: 0.8, browColor: '#6b5f4a', blush: '#e0707a' },
    body: { shape: 'box', torsoW: 150, torsoH: 100, color: '#fbf7ef', outfit: 'envelope', radius: 10, shoulderDrop: 60, shoulderIn: 4, stamp: '#e85d4a' },
    arms: { len: 60, w: 14, color: '#d8cfbf', hand: '#fbf7ef' },
    legs: { len: 58, w: 16, color: '#d8cfbf', shoe: '#e85d4a', shoeLen: 32, shoeH: 14 },
    prop: 'none',
  };
  // Recolour any cast member into a background person: variant('sam', { body: { color: '#..' } })
  CAST.variant = (base, over) => {
    const c = JSON.parse(JSON.stringify(CAST[base]));
    for (const k in over) c[k] = (typeof over[k] === 'object' && !Array.isArray(over[k])) ? Object.assign(c[k] || {}, over[k]) : over[k];
    return c;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CAST;
  if (typeof globalThis !== 'undefined') globalThis.CAST = CAST;
})();
