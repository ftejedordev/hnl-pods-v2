; HypernovaLabs Pods - NSIS Installer Hooks
; Agrega el comando 'pod' al PATH del sistema para uso desde terminal

; ============================================
; POST-INSTALL: Agregar CLI al PATH
; ============================================
!macro NSIS_HOOK_POSTINSTALL
  ; Leer el PATH actual del usuario
  ReadRegStr $0 HKCU "Environment" "PATH"

  ; Si PATH esta vacio, solo agregar nuestra ruta
  StrCmp $0 "" 0 +3
    WriteRegExpandStr HKCU "Environment" "PATH" "$INSTDIR"
    Goto done_path

  ; Si PATH existe, agregar nuestra ruta al final
  WriteRegExpandStr HKCU "Environment" "PATH" "$0;$INSTDIR"

  done_path:

  ; Notificar al sistema que las variables de entorno cambiaron
  ; Esto hace que las terminales nuevas vean el PATH actualizado
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000

  ; Mostrar mensaje en el instalador
  DetailPrint "CLI 'pod' agregado al PATH del sistema."
  DetailPrint "Abre una nueva terminal y escribe: pod help"
!macroend

; ============================================
; POST-UNINSTALL: Limpiar PATH (best effort)
; ============================================
!macro NSIS_HOOK_POSTUNINSTALL
  ; Notificar al sistema
  SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend
