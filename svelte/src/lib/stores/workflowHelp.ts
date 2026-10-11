import { writable } from 'svelte/store';

/** Shared entry point for the short, in-app workflow guide. */
export const workflowHelpOpen = writable(false);
export type WorkflowHelpTopic = 'start' | 'timing' | 'length' | 'arrange';
export const workflowHelpTopic = writable<WorkflowHelpTopic>('start');
export function openWorkflowHelp(topic: WorkflowHelpTopic = 'start') {
  workflowHelpTopic.set(topic);
  workflowHelpOpen.set(true);
}
