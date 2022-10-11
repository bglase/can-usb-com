pipeline {
    agent any
    environment {
            HOME = '.'
    }
    stages {

        stage('Test Node 14') {
            agent {
                docker {
                    image 'node:14-slim'
                }
            }
            steps {
                sh 'rm -rf node_modules'
                sh 'npm install && npm test'
            }
        }
        stage('Test Node 16') {
            agent {
                docker {
                    image 'node:16-slim'
                }
            }
            steps {
                sh 'rm -rf node_modules'
                sh 'npm install && npm test'
            }
        }

    }
    post {
            // Clean after build
            always {
                cleanWs disableDeferredWipeout: true, deleteDirs: true
            }
        }
}