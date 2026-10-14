// Посмотреть все настройки
Settings._state

// Сменить тему (фон изменится мгновенно)
Settings.setTheme('night')
Settings.setTheme('jade')
Settings.setTheme('minimal')
Settings.setTheme('classic')

// Сменить цель
Settings.setGoal(40)

// Получить значение
Settings.get('theme')      // → 'classic'
Settings.get('goal')       // → 40

// Экспорт данных (скопирует JSON в буфер)
Settings.exportData()

// Открыть экран настроек
Settings.show()
