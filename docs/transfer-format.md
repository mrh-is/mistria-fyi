# Retired progress-transfer codes

Progress-transfer QR codes are retired (#138). Use save-driven [sync](sync.md) to follow the gaming
computer’s save on another device. To move hand-tracked check-offs, export a backup from Data, send
it to the other device, and restore it there. Restore replaces that device’s tracker progress.

The build-bound codec and its tests have been removed. Old progress codes cannot be imported. The
camera scanner and follow-link QR renderer remain in `src/routes/sync/qr.ts`.

The [build-binding decision](decisions/2026-10-13-transfer-build-binding.md) records the former
format’s rationale.
