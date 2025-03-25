import * as vscode from 'vscode';
import { exec } from 'child_process';
import { getRemoteAuthority } from './authResolver';
import { WSLDistro, WSLManager, WSLOnlineDistro } from './wsl/wslManager';
import wslTerminal from './wsl/wslTerminal';

async function showDistrosPicker(wslManager: WSLManager, placeHolder: string): Promise<WSLDistro | undefined> {
    const pickItemsPromise = wslManager.listDistros()
        .then(distros => distros.map(distroData => {
            return {
                ...distroData,
                label: `${distroData.name}`,
                detail: distroData.isDefault ? 'default distro' : undefined,
            };
        }));

    const picked = await vscode.window.showQuickPick(pickItemsPromise, { canPickMany: false, placeHolder });
    return picked;
}

async function showOnlineDistrosPicker(wslManager: WSLManager, placeHolder: string): Promise<WSLOnlineDistro | undefined> {
    const pickItemsPromise = Promise.all([wslManager.listOnlineDistros(), wslManager.listDistros()])
        .then(([onlineDistros, localDistros]) => {
            const distroToInstall = onlineDistros.filter(d => !localDistros.some(l => l.name === d.name));
            return distroToInstall.map(distroData => {
                return {
                    ...distroData,
                    label: `${distroData.friendlyName}`,
                };
            });
        });

    const picked = await vscode.window.showQuickPick(pickItemsPromise, { canPickMany: false, placeHolder });
    return picked;
}

export async function promptOpenRemoteWSLWindow(wslManager: WSLManager, useDefault: boolean, reuseWindow: boolean) {
    let distroName: string | undefined;
    if (useDefault) {
        const distros = await wslManager.listDistros();
        distroName = distros.find(distro => distro.isDefault)?.name;
    } else {
        distroName = (await showDistrosPicker(wslManager, 'Select WSL distro'))?.name;
    }

    if (!distroName) {
        return;
    }

    openRemoteWSLWindow(distroName, reuseWindow);
}

export async function promptInstallNewWSLDistro(wslManager: WSLManager) {

    let distroName: string | undefined;
    distroName = (await showOnlineDistrosPicker(wslManager, 'Select the WSL distro to install'))?.name;

    if (!distroName) {
        return;
    }

    wslTerminal.runCommand(`wsl.exe --install -d ${distroName}`);
}

export function openRemoteWSLWindow(distro: string, reuseWindow: boolean) {
    vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: getRemoteAuthority(distro), reuseWindow });
}

export function openRemoteWSLLocationWindow(distro: string, path: string, reuseWindow: boolean) {
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.from({ scheme: 'vscode-remote', authority: getRemoteAuthority(distro), path }), { forceNewWindow: !reuseWindow });
}

export async function setDefaultWSLDistro(wslManager: WSLManager, distroName: string) {
    await wslManager.setDefaultDistro(distroName);
}

export async function deleteWSLDistro(wslManager: WSLManager, distroName: string) {
    const deleteAction = 'Delete';
    const resp = await vscode.window.showInformationMessage(`Are you sure you want to permanently delete the distro "${distroName}" including all its data?`, { modal: true }, deleteAction);
    if (resp === deleteAction) {
        await wslManager.deleteDistro(distroName);
        return true;
    }
    return false;
}

export function setEnvVariable(showMessage = false) {
    const thisExtension: string = 'kv9898.open-remote-wsl';
    const psCommand = `[System.Environment]::SetEnvironmentVariable('POSITRON_WSL_EXTENSION_NAME', '${thisExtension}', 'User')`;
  
    exec(`powershell.exe -Command "${psCommand}"`, (err) => {
      if (err) {
        vscode.window.showErrorMessage('Failed to set POSITRON_WSL_EXTENSION_NAME.');
      } else if (showMessage) {
        vscode.window.showInformationMessage(`POSITRON_WSL_EXTENSION_NAME has been set to "${thisExtension}".`);
      }
    });
  }

export function unsetEnvVariable(showMessage = false) {
    const psCommand = `[System.Environment]::SetEnvironmentVariable('POSITRON_WSL_EXTENSION_NAME', $null, 'User')`;

    exec(`powershell.exe -Command "${psCommand}"`, (err) => {
        if (err) {
        vscode.window.showErrorMessage('Failed to remove POSITRON_WSL_EXTENSION_NAME from the environment.');
        } else if (showMessage) {
        vscode.window.showInformationMessage('POSITRON_WSL_EXTENSION_NAME has been removed from the environment.');
        }
    });
}

export function promptSetEnvVariable(context: vscode.ExtensionContext) {
    const alreadyPrompted = context.globalState.get<boolean>('positronWslPrompted');
    if (!alreadyPrompted) {
        vscode.window.showInformationMessage(
        `Do you want to set the environment variable POSITRON_WSL_EXTENSION_NAME to "kv9898.open-remote-wsl"?`,
        'Yes',
        'No'
        ).then(choice => {
        if (choice === 'Yes') {
            setEnvVariable(true);
        }
        // Mark that we have prompted the user, regardless of answer
        context.globalState.update('positronWslPrompted', true);
        });
    }
}