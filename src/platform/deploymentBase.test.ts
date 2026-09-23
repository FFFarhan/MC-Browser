import { describe, expect, it } from 'vitest';
import { deploymentBase } from './deploymentBase';

describe('static deployment base', () => {
  it('uses the GitHub Pages repository path for Actions builds', () => {
    expect(deploymentBase(true)).toBe('/MC-Browser/');
  });

  it('keeps local builds rooted at the site origin', () => {
    expect(deploymentBase(false)).toBe('/');
  });

  it('keeps user or organization Pages sites rooted at the site origin', () => {
    expect(deploymentBase(true, 'FFFarhan/FFFarhan.github.io')).toBe('/');
  });

  it('uses the repository name from the GitHub Actions context', () => {
    expect(deploymentBase(true, 'someone/voxel-world')).toBe('/voxel-world/');
  });
});
