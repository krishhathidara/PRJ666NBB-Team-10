(async function initSession(){
  const guest = document.getElementById('account-guest');
  const user  = document.getElementById('account-user');
  const mainnav = document.getElementById('mainnav');     // centered menu
  const tabbar  = document.querySelector('.tabbar');       // bottom menu

  // Default: hide menus until we know auth state
  mainnav && mainnav.classList.remove('visible');
  tabbar  && tabbar.classList.add('hidden');

  try{
    const res = await fetch('/api/auth/me', { credentials:'include' });

    if(res.ok){
      // Signed-in: show menus & user actions
      guest && (guest.style.display='none');
      user  && (user.style.display='');
      mainnav && mainnav.classList.add('visible');
      tabbar  && tabbar.classList.remove('hidden');

      // logout handler
      document.getElementById('logout-link')?.addEventListener('click', async (e)=>{
        e.preventDefault();
        await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
        location.href = '/';
      });
    }else{
      // Signed-out: hide menus, show Sign In / Sign Up
      user  && (user.style.display='none');
      guest && (guest.style.display='');
      mainnav && mainnav.classList.remove('visible');
      tabbar  && tabbar.classList.add('hidden');
    }
  }catch{
    // On error, behave like signed-out
    user  && (user.style.display='none');
    guest && (guest.style.display='');
    mainnav && mainnav.classList.remove('visible');
    tabbar  && tabbar.classList.add('hidden');
  }

  // Highlight active item (only if menu is visible)
  const current = (location.pathname.replace(/index\.html$/,'') || '/');
  if(mainnav && mainnav.classList.contains('visible')){
    mainnav.querySelectorAll('a').forEach(a=>{
      a.classList.toggle('active', a.getAttribute('href') === current);
    });
  }
  if(tabbar && !tabbar.classList.contains('hidden')){
    tabbar.querySelectorAll('.tab').forEach(a=>{
      a.classList.toggle('active', a.getAttribute('href') === current);
    });
  }
})();
