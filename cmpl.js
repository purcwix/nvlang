function complainLife(role = "student", shift = "night", patients = 0) {
  const reasons = {
    student: [
      "assignments multiplying like gremlins",
      "exams scheduled during my REM sleep",
      "teachers assigning 4 essays and calling it a break",
      "group projects where I do everything",
      "studying a subject I’ll never use... again",
      "forgot what outside smells like",
      "running on snacks and tears"
    ],
    médecin: [
      "no coffee since 6am",
      "another 24-hour shift",
      "patients googling symptoms and arguing",
      "paperwork breeding like rabbits",
      "forgot to eat... again",
      "someone coughed and said 'do I have the plague?'",
      "hospital Wi-Fi slower than grief"
    ]
  };

  const groans = {
    student: [
      "Why did I take this major?",
      "Do deadlines dream of crushing students?",
      "I should’ve been a cat.",
      "I swear if one more prof says 'you’ll use this in life'...",
      "Can I sell my soul for partial credit?"
    ],
    médecin: [
      "Why did I study 12 years for this?",
      "Is this patient serious?",
      "I swear if one more person says 'just a quick question'...",
      "*internal screaming*",
      "I should’ve opened a cat café."
    ]
  };

  const rant = {
    student: [
      `Being a ${role} during a ${shift} shift is like surviving a hurricane inside a textbook.`,
      `Wrote a 10-page paper, got a 6/10 and emotional trauma.`,
      `Did I blink today? No. Did I learn anything? Also no.`,
      `School: the place where dreams go to get feedback.`,
      `Studied 10 hours. Forgot everything during the test. Iconic.`
    ],
    médecin: [
      `Being a ${role} on a ${shift} shift is like playing life on hard mode with permadeath.`,
      `Treated ${patients} patients, got thanked by 1, and yelled at by 5.`,
      `System glitch? Again? It's not even Mercury retrograde.`,
      `Day in the life: Diagnose, patch, repeat. Soul slowly evaporating.`,
      `Reminder: humans are 70% water and 30% chaos.`
    ]
  };

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const r = role.toLowerCase().includes("med") ? "médecin" : "student";

  return [
    `💀 ${pick(rant[r])}`,
    `🤦 ${pick(groans[r])}`,
    `📌 Because: ${pick(reasons[r])}`
  ].join("\n");
}
console.log(complainLife());
