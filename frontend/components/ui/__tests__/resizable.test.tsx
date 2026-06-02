import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../resizable';

it('exports the three resizable primitives', () => {
  expect(ResizablePanelGroup).toBeDefined();
  expect(ResizablePanel).toBeDefined();
  expect(ResizableHandle).toBeDefined();
});
