// Standard gamepad, Xbox labels.
// Steer +1 is rider-left, the same sign as KeyA. Axis 0 is stick-right,
// so that axis is negated here and nowhere else.
// Right-stick +X matches a mouse drag to the right (camera orbit decreases).

const STICK_DEAD = 0.16;
const LOOK_DEAD = 0.22;
const TRIGGER_DEAD = 0.06;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function stick(x, y, dead) {
  const m = Math.hypot(x, y);
  if (!(m > dead)) return [0, 0];
  const scaled = Math.min(1, (m - dead) / (1 - dead)) / m;
  return [x * scaled, y * scaled];
}

function buttonDown(pad, index) {
  const b = pad.buttons?.[index];
  if (!b) return false;
  return !!b.pressed || (b.value ?? 0) > 0.5;
}

function trigger(pad, index) {
  const b = pad.buttons?.[index];
  const v = b ? (b.value ?? (b.pressed ? 1 : 0)) : 0;
  if (v <= TRIGGER_DEAD) return 0;
  return Math.min(1, (v - TRIGGER_DEAD) / (1 - TRIGGER_DEAD));
}

const IDLE = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  jump: false,
  camera: false,
  reset: false,
  lookX: 0,
  lookY: 0,
};

export function readGamepad(pad) {
  if (!pad || !pad.connected) return { ...IDLE };

  const ax = pad.axes || [];
  const [lx, ly] = stick(ax[0] || 0, ax[1] || 0, STICK_DEAD);
  const [rx, ry] = stick(ax[2] || 0, ax[3] || 0, LOOK_DEAD);

  return {
    throttle: clamp(Math.max(trigger(pad, 7), Math.max(0, -ly), buttonDown(pad, 12) ? 1 : 0), 0, 1),
    brake: clamp(Math.max(trigger(pad, 6), Math.max(0, ly), buttonDown(pad, 13) ? 1 : 0), 0, 1),
    steer: clamp(-lx + (buttonDown(pad, 14) ? 1 : 0) - (buttonDown(pad, 15) ? 1 : 0), -1, 1),
    boost: buttonDown(pad, 2) || buttonDown(pad, 4),
    jump: buttonDown(pad, 0),
    camera: buttonDown(pad, 3),
    reset: buttonDown(pad, 9),
    lookX: rx,
    lookY: ry,
  };
}
