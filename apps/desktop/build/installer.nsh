; Extra install steps, run by the NSIS installer.
;
; The installer is `perMachine`, so it already runs elevated — which is the only
; reason this can touch the firewall at all. Doing it here means the person
; setting up a till never has to open an administrator prompt, and never has to
; be told that scans arrive over the network and Windows blocks that by default.
;
; Without the rule the terminal's pushes are dropped silently: it has no way to
; report that its destination refused the connection, so attendance simply never
; appears and nothing anywhere says why.

!macro customInstall
  DetailPrint "Allowing the door terminal to reach this PC on port 7090..."
  ; Removed first so reinstalling does not stack duplicate rules under one name.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="GYM API"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="GYM API" dir=in action=allow protocol=TCP localport=7090 profile=any'
!macroend

!macro customUnInstall
  DetailPrint "Removing the firewall rule..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="GYM API"'
!macroend
