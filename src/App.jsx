git add .
git commit -m "Fix: Rotation automatique des questions"
git push
```
4. Vercel va automatiquement redéployer

### **Étape 3 : Tester**

Une fois le code déployé et Firebase nettoyé :
1. Allez sur https://quiz-buteur.vercel.app
2. Cliquez sur **Admin**
3. Cliquez sur **"Lancer le système auto"**
4. Retournez dans Firebase et vous devriez voir `currentQuestion` avec TOUTES les données :
```
currentQuestion:
  id: "1729285678901"
  text: "Qui va marquer le prochain but ?"
  options: ["Mbappé", "Griezmann", "Giroud", "Dembélé"]
  timeLeft: 30
  createdAt: 1729285678901
