/** Physical keys used for walk / sneak / actions. Layout-independent. */
const CODE_ALIASES: Record<string, string[]> = {
  KeyW: ["w"],
  KeyA: ["a"],
  KeyS: ["s"],
  KeyD: ["d"],
  ArrowUp: ["arrowup"],
  ArrowDown: ["arrowdown"],
  ArrowLeft: ["arrowleft"],
  ArrowRight: ["arrowright"],
  ShiftLeft: ["shift"],
  ShiftRight: ["shift"],
  KeyF: ["f"],
  KeyE: ["e"],
  KeyM: ["m"],
  Space: [" "],
};

const PREVENT_DEFAULT = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  " ",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);

export type Keyish = Pick<KeyboardEvent, "key" | "code">;

/** Tokens stored for one key event — `event.code` plus `event.key` aliases. */
export function tokensForKeyEvent(event: Keyish): string[] {
  const tokens = new Set<string>();
  if (event.code) {
    tokens.add(event.code);
    for (const alias of CODE_ALIASES[event.code] ?? []) tokens.add(alias);
  }
  if (event.key) {
    tokens.add(event.key);
    tokens.add(event.key.toLowerCase());
  }
  return [...tokens];
}

export function inputHeld(keys: Iterable<string>, ...tokens: string[]): boolean {
  const set = keys instanceof Set ? keys : new Set(keys);
  return tokens.some((token) => set.has(token));
}

/**
 * Only a real tab hide should drop held keys. Window `blur` and pointer-lock
 * churn fire in automated browsers and must not wipe WASD.
 */
export function shouldClearHeldKeys(visibilityState: string): boolean {
  return visibilityState === "hidden";
}

/** Stick + keyboard walk vector. +z is camera-forward intent before yaw. */
export function walkIntent(keys: Iterable<string>, stickX = 0, stickY = 0): { x: number; z: number } {
  const set = keys instanceof Set ? keys : new Set(keys);
  let ix = stickX;
  let iz = -stickY;
  if (inputHeld(set, "w", "KeyW", "arrowup", "ArrowUp")) iz += 1;
  if (inputHeld(set, "s", "KeyS", "arrowdown", "ArrowDown")) iz -= 1;
  if (inputHeld(set, "a", "KeyA", "arrowleft", "ArrowLeft")) ix -= 1;
  if (inputHeld(set, "d", "KeyD", "arrowright", "ArrowRight")) ix += 1;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) {
    ix /= mag;
    iz /= mag;
  }
  return { x: ix, z: iz };
}

export class Input {
  readonly keys = new Set<string>();
  lookX = 0;
  lookY = 0;
  stickX = 0;
  stickY = 0;
  sneakHeld = false;
  private flashlightQueued = false;
  private interactQueued = false;
  private muteQueued = false;
  private sneakTap = false;
  private lookTouch: number | null = null;
  private lastLook: { x: number; y: number } | null = null;
  private stickTouch: number | null = null;

  attach(): void {
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("mousemove", this.onMouse);
    document.addEventListener("visibilitychange", this.onVisibility);
    const stick = document.getElementById("stick");
    const look = document.getElementById("look-pad");
    stick?.addEventListener("touchstart", this.onStickStart, { passive: false });
    stick?.addEventListener("touchmove", this.onStickMove, { passive: false });
    stick?.addEventListener("touchend", this.onStickEnd);
    look?.addEventListener("touchstart", this.onLookStart, { passive: false });
    look?.addEventListener("touchmove", this.onLookMove, { passive: false });
    look?.addEventListener("touchend", this.onLookEnd);
    document.getElementById("btn-flash")?.addEventListener("click", () => {
      this.flashlightQueued = true;
    });
    document.getElementById("btn-use")?.addEventListener("click", () => {
      this.interactQueued = true;
    });
    document.getElementById("btn-sneak")?.addEventListener("click", () => {
      this.sneakTap = !this.sneakTap;
    });
  }

  held(...tokens: string[]): boolean {
    return inputHeld(this.keys, ...tokens);
  }

  consumeFlashlight(): boolean {
    const v = this.flashlightQueued;
    this.flashlightQueued = false;
    return v;
  }

  consumeInteract(): boolean {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  consumeMute(): boolean {
    const v = this.muteQueued;
    this.muteQueued = false;
    return v;
  }

  get sneaking(): boolean {
    return this.sneakHeld || this.sneakTap || this.held("shift", "Shift", "ShiftLeft", "ShiftRight");
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const tokens = tokensForKeyEvent(event);
    for (const token of tokens) this.keys.add(token);
    if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.sneakHeld = true;
    }
    if (!event.repeat) {
      if (inputHeld(tokens, "f", "KeyF")) this.flashlightQueued = true;
      if (inputHeld(tokens, "e", "KeyE")) this.interactQueued = true;
      if (inputHeld(tokens, "m", "KeyM")) this.muteQueued = true;
    }
    if (PREVENT_DEFAULT.has(event.code) || PREVENT_DEFAULT.has(event.key) || PREVENT_DEFAULT.has(event.key.toLowerCase())) {
      event.preventDefault();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    for (const token of tokensForKeyEvent(event)) this.keys.delete(token);
    if (event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      this.sneakHeld = false;
    }
  };

  private onMouse = (event: MouseEvent): void => {
    if (document.pointerLockElement) {
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    }
  };

  private onVisibility = (): void => {
    if (shouldClearHeldKeys(document.visibilityState)) this.releaseHeld();
  };

  private releaseHeld = (): void => {
    this.keys.clear();
    this.sneakHeld = false;
  };

  private onStickStart = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (!touch) return;
    this.stickTouch = touch.identifier;
    this.updateStick(touch);
  };

  private onStickMove = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = this.findTouch(event, this.stickTouch);
    if (touch) this.updateStick(touch);
  };

  private onStickEnd = (): void => {
    this.stickTouch = null;
    this.stickX = 0;
    this.stickY = 0;
    const knob = document.getElementById("stick-knob");
    if (knob) {
      knob.style.transform = "translate(0,0)";
    }
  };

  private updateStick(touch: Touch): void {
    const el = document.getElementById("stick");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let x = (touch.clientX - cx) / (rect.width * 0.45);
    let y = (touch.clientY - cy) / (rect.height * 0.45);
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    this.stickX = x;
    this.stickY = y;
    const knob = document.getElementById("stick-knob");
    if (knob) knob.style.transform = `translate(${x * 28}px, ${y * 28}px)`;
  }

  private onLookStart = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (!touch) return;
    this.lookTouch = touch.identifier;
    this.lastLook = { x: touch.clientX, y: touch.clientY };
  };

  private onLookMove = (event: TouchEvent): void => {
    event.preventDefault();
    const touch = this.findTouch(event, this.lookTouch);
    if (!touch || !this.lastLook) return;
    this.lookX += touch.clientX - this.lastLook.x;
    this.lookY += touch.clientY - this.lastLook.y;
    this.lastLook = { x: touch.clientX, y: touch.clientY };
  };

  private onLookEnd = (): void => {
    this.lookTouch = null;
    this.lastLook = null;
  };

  private findTouch(event: TouchEvent, id: number | null): Touch | undefined {
    if (id === null) return undefined;
    return Array.from(event.touches).find((touch) => touch.identifier === id);
  }
}
