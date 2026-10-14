(() => {
  'use strict';
  document.documentElement.classList.add('js-enabled');
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panels = [...document.querySelectorAll('.screen-review')];
  const selectTab = (tab, focus = false) => {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        selectTab(tabs[nextIndex], true);
      }
    });
  });
  if (tabs.length) selectTab(tabs[0]);

  const proposals = [...document.querySelectorAll('.proposal')];
  const filters = [...document.querySelectorAll('[data-filter]')];
  const expand = document.getElementById('expand-proposals');
  const refreshExpand = () => {
    const visibleDetails = proposals.filter(card => !card.hidden).map(card => card.querySelector('details'));
    const allOpen = visibleDetails.every(detail => detail.open);
    expand.textContent = allOpen ? 'Collapse proposal details −' : 'Expand proposal details +';
    expand.setAttribute('aria-expanded', String(allOpen));
  };
  filters.forEach(button => button.addEventListener('click', () => {
    filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
    proposals.forEach(card => { card.hidden = button.dataset.filter !== 'All' && card.dataset.phase !== button.dataset.filter; });
    document.getElementById('result-count').textContent = `${proposals.filter(card => !card.hidden).length} of ${proposals.length} proposals shown. All are proposed work.`;
    refreshExpand();
  }));
  expand.addEventListener('click', () => {
    const shouldOpen = expand.getAttribute('aria-expanded') !== 'true';
    proposals.filter(card => !card.hidden).forEach(card => { card.querySelector('details').open = shouldOpen; });
    refreshExpand();
  });
  proposals.forEach(card => card.querySelector('details').addEventListener('toggle', refreshExpand));

  const dialog = document.getElementById('image-dialog');
  const dialogImage = document.getElementById('dialog-image');
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
    const source = document.getElementById(button.dataset.zoom);
    dialogImage.src = source.src;
    dialogImage.alt = source.alt;
    document.getElementById('dialog-title').textContent = source.alt;
    dialog.showModal();
    dialog.scrollTop = 0;
  }));
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  let printState = [];
  window.addEventListener('beforeprint', () => {
    printState = [...document.querySelectorAll('details')].map(detail => [detail, detail.open]);
    printState.forEach(([detail]) => { detail.open = true; });
  });
  window.addEventListener('afterprint', () => printState.forEach(([detail, wasOpen]) => { detail.open = wasOpen; }));
  document.getElementById('print-review').addEventListener('click', () => window.print());
})();
