# Registers the merge agent with Windows Task Scheduler: it runs every few minutes while you
# are signed in. Run it again after the agent changes on main, to copy the new version.
# Remove it with: Unregister-ScheduledTask -TaskName VillageSqwhereMergeAgent -Confirm:$false
param([int]$Minutes = 5)
$ErrorActionPreference = 'Stop'

$agentHome = if ($env:MERGE_AGENT_HOME) { $env:MERGE_AGENT_HOME } else { Join-Path $env:LOCALAPPDATA 'village-sqwhere-merge-agent' }
New-Item -ItemType Directory -Force $agentHome | Out-Null
# A copy, so the scheduled runs never depend on what is checked out in your working copy.
Copy-Item (Join-Path $PSScriptRoot 'merge_agent.py') $agentHome -Force

$python = (& uv python find 3.13).Trim()
# pythonw runs without opening a console window every few minutes.
$pythonw = Join-Path (Split-Path $python) 'pythonw.exe'
if (-not (Test-Path $pythonw)) { throw "pythonw.exe not found next to $python" }

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$agentHome\merge_agent.py`"" -WorkingDirectory $agentHome
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $Minutes)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'VillageSqwhereMergeAgent' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Tests open Village Sqwhere pull requests and squash merges the green ones.' -Force | Out-Null

Write-Host "Installed. It runs every $Minutes minutes. Log: $agentHome\agent.log"
