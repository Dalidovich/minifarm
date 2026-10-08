(function () {
  const MAX_FRAME = 0.1;

  window.addEventListener('load', function () {
    MF.game.load();
    MF.i18n.set(MF.game.state.settings.lang || MF.i18n.detect());
    MF.render.init(document.getElementById('game'));
    MF.ui.init();
    document.getElementById('favicon').href = MF.sprites.url(MF.sprites.icons.carrot);

    let last = performance.now();
    function frame(now) {
      const dt = Math.max(0, Math.min((now - last) / 1000, MAX_FRAME));
      last = now;
      MF.game.update(dt);
      MF.render.draw(dt);
      MF.ui.tick(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    window.addEventListener('beforeunload', MF.game.save);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) MF.game.save();
    });
  });
})();
