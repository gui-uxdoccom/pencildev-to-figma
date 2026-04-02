// Mobile nav toggle
const toggle = document.getElementById('navToggle')
const links  = document.querySelector('.nav__links')
if (toggle && links) {
  toggle.addEventListener('click', () => {
    links.classList.toggle('open')
  })
}

// Close mobile nav on link click
document.querySelectorAll('.nav__link').forEach(link => {
  link.addEventListener('click', () => links && links.classList.remove('open'))
})

// Smooth scroll offset for sticky nav
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1)
    const target = document.getElementById(id)
    if (!target) return
    e.preventDefault()
    const offset = 72
    const top = target.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
  })
})
