import './style.css';
import { startApplication } from './app/bootstrap';
import { renderFatalError } from './app/errors';

const root = document.querySelector<HTMLElement>('#app');

if (!root) {
  throw new Error('Stonefield root element #app is missing.');
}

let application: Awaited<ReturnType<typeof startApplication>> = null;
const reportFailure = (error: unknown): void => {
  application?.dispose();
  application = null;
  renderFatalError(root, error);
};

window.addEventListener('error', (event) => reportFailure(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportFailure(event.reason));

void startApplication(root).then((started) => {
  application = started;
});
