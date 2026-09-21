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
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouse);
    window.addEventListener("blur", this.clear);
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
    return this.sneakHeld || this.sneakTap || this.keys.has("shift");
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.key.toLowerCase());
    if (event.key === "Shift") this.sneakHeld = true;
    if (event.key.toLowerCase() === "f") this.flashlightQueued = true;
    if (event.key.toLowerCase() === "e") this.interactQueued = true;
    if (event.key.toLowerCase() === "m") this.muteQueued = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(event.key.toLowerCase())) {
      event.preventDefault();
    }
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    if (event.key === "Shift") this.sneakHeld = false;
  };

  private onMouse = (event: MouseEvent): void => {
    if (document.pointerLockElement) {
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    }
  };

  private clear = (): void => {
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
