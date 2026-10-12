/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import './playground';

document.addEventListener('DOMContentLoaded', () => {
  const rootElement = document.querySelector('#root')! as HTMLElement;
  
  const playground = document.createElement('gdm-playground');
  rootElement.appendChild(playground);
});
