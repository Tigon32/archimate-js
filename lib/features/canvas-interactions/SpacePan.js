export default function SpacePan(eventBus, canvas) {
  let svg;
  let spacePressed = false;
  let panStart;

  const onMouseDown = (event) => {
    if (!spacePressed || event.button !== 0 || isEditableTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panStart = { x: event.clientX, y: event.clientY };
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
  };

  const onMouseMove = (event) => {
    if (!panStart) return;
    canvas.scroll({ dx: event.clientX - panStart.x, dy: event.clientY - panStart.y });
    panStart = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  };

  const onMouseUp = () => {
    stopPan();
  };

  const onKeyDown = (event) => {
    if (!isSpace(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isEditableTarget(event.target)) return;
    spacePressed = true;
  };

  const onKeyUp = (event) => {
    if (!isSpace(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    spacePressed = false;
    stopPan();
  };

  function stopPan() {
    panStart = undefined;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('mouseup', onMouseUp, true);
  }

  function detach() {
    stopPan();
    spacePressed = false;
    if (svg) {
      svg.removeEventListener('mousedown', onMouseDown, true);
      svg.removeEventListener('keydown', onKeyDown, true);
      svg.removeEventListener('keyup', onKeyUp, true);
    }
    svg = undefined;
  }

  eventBus.on('canvas.init', (event) => {
    svg = event.svg;
    svg.addEventListener('mousedown', onMouseDown, true);
    svg.addEventListener('keydown', onKeyDown, true);
    svg.addEventListener('keyup', onKeyUp, true);
  });
  eventBus.on('diagram.destroy', detach);
}

SpacePan.$inject = [ 'eventBus', 'canvas' ];

function isSpace(event) {
  return event.code === 'Space' || event.key === ' ' || event.key === 'Space';
}

function isEditableTarget(target) {
  return target instanceof Element &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"], .djs-direct-editing-content'));
}
