# Sync pairing confirmation

## Context

Pairing (#133) hands a single-use offer to whoever scans the PC’s QR first. Players stream this
game, and a QR shown on stream, or in a shared screenshot, lets a viewer answer the offer before the
player does. [sync.md](../sync.md#stages--generations) says the phone shows “Paired” only once the
PC accepts, but not whether a person takes part in that acceptance. The setup design (#131) had to
choose.

## Decision

- **The player confirms the answering device on the PC.** The PC asks “Was that you?”, naming the
  answering device. “Yep, that’s me” accepts; “Nope” rejects, discards the offer, & issues a fresh
  one. When a device is already paired, the prompt names the device it replaces.
- **The QR starts covered.** “Show code” reveals it & starts its expiry countdown; “Hide code”
  covers it again. A streaming hint sits beside it.

## Alternatives

- **Automatic acceptance after the MAC check.** Fewer steps, but the MAC proves only that the
  answerer saw the QR, which is exactly what a stream leak gives away. A hijacked pairing sends the
  player’s progress to a stranger & silently unpairs their own phone.
- **A short code typed on the PC.** Stronger than a yes/no prompt, but it adds a typing step on the
  device the player is least likely to be looking at, & the device name already tells a stranger’s
  phone apart in the common case.
- **The stream hint alone.** Relies on players reading it before they show the code.

## Revisit if

- Players report the confirmation as friction & no leaked-code pairing has been reported.
- Pairing gains another out-of-band check (for example, the phone displaying a code the PC must
  match), which would make the prompt redundant.
