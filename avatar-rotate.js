const initAvatarFlip = () => {
  const avatar = document.querySelector('.avatar');
  const avatarImg = document.getElementById('avatar-img');
  if (!avatar || !avatarImg) return;
  const avatarImages = [
    "ibd.jpeg",
    "logo.png"
  ];
  let nextIndex = 1; // start after the current src
  let swapTimeout;
  let resetFlipTimeout;
  const flipDuration = 600;

  const queueImageSwap = () => {
    clearTimeout(swapTimeout);
    swapTimeout = setTimeout(() => {
      avatarImg.src = avatarImages[nextIndex];
      nextIndex = (nextIndex + 1) % avatarImages.length;
    }, flipDuration / 2); // change photo once the flip is edge-on
  };

  const triggerFlip = () => {
    avatar.classList.remove('flipping'); // allow re-trigger
    void avatar.offsetWidth; // force reflow
    avatar.classList.add('flipping');
    queueImageSwap();
    clearTimeout(resetFlipTimeout);
    resetFlipTimeout = setTimeout(() => {
      avatar.classList.remove('flipping');
    }, flipDuration);
  };

  avatar.addEventListener('mouseenter', triggerFlip);
  avatar.addEventListener('mouseleave', triggerFlip);
  avatar.addEventListener('touchstart', (event) => {
    event.preventDefault();
    triggerFlip();
  }, { passive: false });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAvatarFlip);
} else {
  initAvatarFlip();
}
