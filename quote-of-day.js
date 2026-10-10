// Quote of the day. Picks one quote per local calendar day and swaps it at midnight.
(function(){
  const QUOTES=[
    ["What we do today is what matters most.","Buddhist proverb"],
    ["The journey of a thousand miles begins with a single step.","Lao Tzu"],
    ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.","Will Durant"],
    ["It does not matter how slowly you go as long as you do not stop.","Confucius"],
    ["Take care of your body. It's the only place you have to live.","Jim Rohn"],
    ["Small daily improvements are the key to staggering long-term results.","Unknown"],
    ["The best time to plant a tree was twenty years ago. The second best time is now.","Chinese proverb"],
    ["Discipline is choosing between what you want now and what you want most.","Abraham Lincoln (attributed)"],
    ["Motivation gets you going, but discipline keeps you growing.","John C. Maxwell"],
    ["He who has health has hope, and he who has hope has everything.","Arabian proverb"],
    ["You don't have to be great to start, but you have to start to be great.","Zig Ziglar"],
    ["Strength does not come from the physical capacity. It comes from an indomitable will.","Mahatma Gandhi"],
    ["Success is the sum of small efforts, repeated day in and day out.","Robert Collier"],
    ["The secret of getting ahead is getting started.","Mark Twain (attributed)"],
    ["Fall seven times, stand up eight.","Japanese proverb"],
    ["Energy and persistence conquer all things.","Benjamin Franklin"],
    ["What gets measured gets managed.","Peter Drucker (attributed)"],
    ["A year from now you may wish you had started today.","Karen Lamb"],
    ["Rest when you're weary. Refresh and renew yourself. Then get back to work.","Ralph Marston"],
    ["The groundwork for all happiness is good health.","Leigh Hunt"],
    ["Do something today that your future self will thank you for.","Sean Patrick Flanery"],
    ["Progress, not perfection.","Unknown"],
    ["Well done is better than well said.","Benjamin Franklin"],
    ["The body achieves what the mind believes.","Napoleon Hill (attributed)"],
    ["Little by little, one travels far.","Spanish proverb"],
    ["Don't count the days. Make the days count.","Muhammad Ali"],
    ["Consistency is what transforms average into excellence.","Unknown"],
    ["Our greatest glory is not in never falling, but in rising every time we fall.","Confucius"],
    ["To keep the body in good health is a duty; otherwise we shall not be able to keep our mind strong and clear.","Buddha (attributed)"],
    ["Action is the foundational key to all success.","Pablo Picasso"],
    ["Nothing will work unless you do.","Maya Angelou"]
  ];
  const text=document.getElementById('quote-text');
  const author=document.getElementById('quote-author');
  if(!text||!author) return;

  // Day number in local time, so the quote changes at the viewer's midnight.
  function dayNumber(d){ return Math.floor((d.getTime()-d.getTimezoneOffset()*60000)/86400000); }
  function render(){
    const now=new Date();
    const q=QUOTES[((dayNumber(now)%QUOTES.length)+QUOTES.length)%QUOTES.length];
    text.textContent=q[0];
    author.textContent='— '+q[1];
    const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,0,500);
    clearTimeout(render.timer);
    render.timer=setTimeout(render,Math.max(1000,midnight-now));
  }
  render();
  // Re-check when the tab comes back; a sleeping device can miss the timer.
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) render(); });
})();
